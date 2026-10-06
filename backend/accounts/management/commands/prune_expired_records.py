"""Bound retention for expired credentials and sensitive operational rows."""

from datetime import timedelta

from django.contrib.sessions.models import Session
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from accounts.models import ActivityLog
from mail_log.models import OutboundEmailLog
from payments.models import IdempotencyRecord


class Command(BaseCommand):
    help = "Dry-run or delete expired session/token/idempotency rows and aged operational logs."

    def add_arguments(self, parser):
        parser.add_argument("--execute", action="store_true")
        parser.add_argument("--activity-days", type=int, default=365)
        parser.add_argument("--mail-log-days", type=int, default=90)

    def handle(self, *args, **options):
        activity_days = options["activity_days"]
        mail_days = options["mail_log_days"]
        if activity_days < 1 or mail_days < 1:
            raise CommandError("Retention days must be positive.")
        now = timezone.now()
        targets = {
            "expired_sessions": Session.objects.filter(expire_date__lt=now),
            "expired_refresh_tokens": OutstandingToken.objects.filter(expires_at__lt=now),
            "expired_idempotency": IdempotencyRecord.objects.filter(expires_at__lt=now),
            "aged_activity_logs": ActivityLog.objects.filter(created_at__lt=now - timedelta(days=activity_days)),
            "aged_mail_logs": OutboundEmailLog.objects.filter(created_at__lt=now - timedelta(days=mail_days)),
        }
        counts = {name: rows.count() for name, rows in targets.items()}
        self.stdout.write(" ".join(f"{name}={count}" for name, count in counts.items()))
        self.stdout.write(f"execute={options['execute']}")
        if options["execute"]:
            with transaction.atomic():
                for rows in targets.values():
                    rows.delete()
