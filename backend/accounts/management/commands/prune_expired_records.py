"""Bound retention for expired credentials and sensitive operational rows."""

from datetime import timedelta

from django.conf import settings
from django.contrib.sessions.models import Session
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from accounts.models import ActivityLog
from mail_log.models import OutboundEmailLog
from payments.models import IdempotencyRecord


def _database_cache_table() -> str | None:
    cache = settings.CACHES.get("default", {})
    if cache.get("BACKEND") != "django.core.cache.backends.db.DatabaseCache":
        return None
    return cache["LOCATION"]


class _ExpiredCacheRows:
    """Expired rows of the database cache. Django only removes them once the table is full,
    and until then it counts the whole table on every cache write (each rate-limited request)."""

    def __init__(self, table: str, now):
        self.table = connection.ops.quote_name(table)
        self.now = now

    def count(self) -> int:
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(*) FROM {self.table} WHERE expires < %s", [self.now])
            return cursor.fetchone()[0]

    def delete(self) -> None:
        with connection.cursor() as cursor:
            cursor.execute(f"DELETE FROM {self.table} WHERE expires < %s", [self.now])


class Command(BaseCommand):
    help = (
        "Dry-run or delete expired session/token/idempotency/cache rows and aged operational logs."
    )

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
        cache_table = _database_cache_table()
        if cache_table:
            targets["expired_cache_entries"] = _ExpiredCacheRows(cache_table, now)
        counts = {name: rows.count() for name, rows in targets.items()}
        self.stdout.write(" ".join(f"{name}={count}" for name, count in counts.items()))
        self.stdout.write(f"execute={options['execute']}")
        if options["execute"]:
            with transaction.atomic():
                for rows in targets.values():
                    rows.delete()
