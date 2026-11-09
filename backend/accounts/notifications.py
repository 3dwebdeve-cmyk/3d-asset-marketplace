from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AdminNotification
from accounts.permissions import IsAdministrator
from config.mail import frontend_base_url, send_text_mail
from mail_log.services import MailLogService
from products.models import Product


class ReadNotificationSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    all = serializers.BooleanField(default=False)

    def validate(self, attrs):
        if bool(attrs.get("id")) == attrs["all"]:
            raise serializers.ValidationError("Provide either an id or all=true.")
        return attrs


class AdminNotificationsView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]

    def get(self, request):
        active = AdminNotification.objects.filter(resolved_at=None)
        page = list(active[:30])
        read = set(request.user.read_admin_notifications.filter(pk__in=[row.pk for row in page]).values_list("pk", flat=True))
        response = Response({
            "unread_count": active.exclude(read_by=request.user).count(),
            "results": [{"id": str(row.pk), "title": row.title, "path": row.path,
                         "created_at": row.created_at, "is_read": row.pk in read} for row in page],
        })
        response["Cache-Control"] = "no-store"
        return response

    def post(self, request):
        serializer = ReadNotificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        notices = AdminNotification.objects.filter(resolved_at=None)
        if not data["all"]:
            notices = notices.filter(pk=data["id"])
            if not notices.exists():
                raise NotFound("Notification not found.")
        through = AdminNotification.read_by.through
        through.objects.bulk_create([
            through(adminnotification_id=pk, user_id=request.user.pk)
            for pk in notices.exclude(read_by=request.user).values_list("pk", flat=True)
        ], ignore_conflicts=True)
        response = Response({"detail": "Marked as read."})
        response["Cache-Control"] = "no-store"
        return response


def overdue_notifications():
    return AdminNotification.objects.filter(
        kind="model_review", resolved_at=None, reminder_sent_at=None,
        created_at__lte=timezone.now() - timedelta(days=settings.ADMIN_REVIEW_REMINDER_DAYS),
        product__status="pending_review",
    )


def _deliver_review_reminders(notification_ids):
    # Serialize overlapping jobs and recheck status at delivery, not only at scheduling.
    # Provider success followed by a process/DB crash can still cause a retry duplicate.
    with transaction.atomic():
        product_ids = overdue_notifications().filter(pk__in=notification_ids).values_list("product_id", flat=True)
        # Approval locks the product before updating its notification. Use that same
        # lock order, so a model cannot be approved between the recheck and delivery.
        list(Product.objects.select_for_update().filter(pk__in=product_ids).order_by("pk").only("pk"))
        rows = list(overdue_notifications().filter(pk__in=notification_ids)
                    .select_for_update(of=("self",)).order_by("pk"))
        if not rows:
            return
        recipient = settings.ADMIN_REVIEW_REMINDER_EMAIL
        body = f"These models are still waiting for approval after {settings.ADMIN_REVIEW_REMINDER_DAYS} days:\n\n" + "\n\n".join(
            f"{row.title}\nWaiting since: {row.created_at:%Y-%m-%d %H:%M UTC}\n{frontend_base_url()}{row.path}"
            for row in rows
        ) + "\n\nApprove or reject each model from its admin page.\n"
        subject = f"AssetHive3D: {len(rows)} model(s) waiting for approval"
        log_id = MailLogService.record_queued(event_type="model_review_reminder", recipients=[recipient], subject=subject)
        send_text_mail(subject=subject, body=body, recipients=[recipient])
        MailLogService.mark_sent(log_id)
        AdminNotification.objects.filter(pk__in=[row.pk for row in rows]).update(reminder_sent_at=timezone.now())


def deliver_review_reminders(notification_ids):
    try:
        _deliver_review_reminders(notification_ids)
    except Exception as exc:
        log_id = MailLogService.record_queued(
            event_type="model_review_reminder", recipients=[settings.ADMIN_REVIEW_REMINDER_EMAIL],
            subject="Model review reminder delivery failed",
        )
        MailLogService.mark_failed(log_id, str(exc))
        raise
