from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from django.db.models import QuerySet

from accounts.models import User
from accounts.services import AuthenticationService
from notifications.models import Notification

logger = logging.getLogger("notifications.services")

ALLOWED_ORDERING = frozenset(
    {
        "created_at",
        "-created_at",
        "is_read",
        "-is_read",
    }
)


class NotificationError(Exception):
    def __init__(self, message: str, *, field: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.field = field


class NotificationService:
    """DB-backed in-app notifications. Emit helpers are fail-soft."""

    @classmethod
    def list_for_user(
        cls,
        user: User,
        *,
        is_read: bool | None = None,
        ordering: str = "-created_at",
    ) -> QuerySet[Notification]:
        if ordering not in ALLOWED_ORDERING:
            raise NotificationError("Invalid ordering.", field="ordering")
        queryset = Notification.objects.filter(user=user)
        if is_read is not None:
            queryset = queryset.filter(is_read=is_read)
        return queryset.order_by(ordering)

    @classmethod
    def unread_count(cls, user: User) -> int:
        return Notification.objects.filter(user=user, is_read=False).count()

    @classmethod
    def get_for_user(cls, user: User, notification_id: UUID) -> Notification:
        try:
            return Notification.objects.get(pk=notification_id, user=user)
        except Notification.DoesNotExist as exc:
            raise NotificationError("Notification not found.") from exc

    @classmethod
    def mark_read(cls, user: User, notification_id: UUID) -> Notification:
        notification = cls.get_for_user(user, notification_id)
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read", "updated_at"])
        return notification

    @classmethod
    def mark_all_read(cls, user: User) -> int:
        return Notification.objects.filter(user=user, is_read=False).update(is_read=True)

    @classmethod
    def notify_user(
        cls,
        user: User | None,
        *,
        title: str,
        message: str,
        link: str = "",
    ) -> Notification | None:
        """Create a notification. Never raises to callers (fail-soft)."""
        try:
            if user is None or not user.is_active:
                return None
            clean_title = " ".join(str(title).split())[:200]
            clean_message = " ".join(str(message).split())[:500]
            clean_link = str(link or "").strip()[:500]
            if not clean_title or not clean_message:
                return None
            return Notification.objects.create(
                user=user,
                title=clean_title,
                message=clean_message,
                link=clean_link,
            )
        except Exception:
            logger.exception(
                "in_app_notification_failed user_id=%s title=%s",
                getattr(user, "pk", None),
                title,
            )
            return None

    @classmethod
    def notify_quotation_sent(cls, project: Any) -> None:
        customer = getattr(project, "customer", None)
        title_text = (getattr(project, "title", None) or "your project").strip()
        cls.notify_user(
            customer,
            title="Quotation ready",
            message=f"A quotation is ready for {title_text}.",
            link=f"/dashboard/projects/{project.pk}",
        )

    @classmethod
    def notify_project_message(cls, message: Any) -> None:
        project = getattr(message, "project", None)
        sender = getattr(message, "sender", None)
        if project is None or sender is None:
            return

        title_text = (getattr(project, "title", None) or "your project").strip()
        sender_is_admin = AuthenticationService.is_administrator(sender)

        if sender_is_admin:
            cls.notify_user(
                project.customer,
                title="New project message",
                message=f"You have a new message on {title_text}.",
                link=f"/dashboard/projects/{project.pk}",
            )
            return

        designer = getattr(project, "assigned_designer", None)
        if designer is not None and AuthenticationService.is_administrator(designer):
            cls.notify_user(
                designer,
                title="New project message",
                message=f"New customer message on {title_text}.",
                link=f"/admin/projects/{project.pk}",
            )

    @classmethod
    def notify_delivery_uploaded(cls, delivery: Any) -> None:
        project = getattr(delivery, "project", None)
        if project is None:
            return
        customer = getattr(project, "customer", None)
        title_text = (getattr(project, "title", None) or "your project").strip()
        version = getattr(delivery, "version", None)
        version_label = f" (v{version})" if version is not None else ""
        cls.notify_user(
            customer,
            title="Project delivery uploaded",
            message=f"A new delivery{version_label} is available for {title_text}.",
            link=f"/dashboard/projects/{project.pk}",
        )

    @classmethod
    def notify_order_status_changed(cls, order: Any, new_status: str) -> None:
        customer = getattr(order, "user", None)
        invoice = (getattr(order, "invoice_number", None) or "your order").strip()
        status_label = str(new_status).replace("_", " ")
        cls.notify_user(
            customer,
            title="Order status updated",
            message=f"Order {invoice} is now {status_label}.",
            link=f"/dashboard/orders/{order.pk}",
        )
