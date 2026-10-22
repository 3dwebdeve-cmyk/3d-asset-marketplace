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


# The database cache table (CACHES["default"]["LOCATION"] in settings). Spelled out in the SQL
# below so no query text is ever assembled from a variable.
CACHE_TABLE = "marketplace_cache"


def _uses_database_cache_table() -> bool:
    cache = settings.CACHES.get("default", {})
    return (
        cache.get("BACKEND") == "django.core.cache.backends.db.DatabaseCache"
        and cache.get("LOCATION") == CACHE_TABLE
    )


class _ExpiredCacheRows:
    """Expired rows of the database cache. Django only removes them once the table is full,
    and until then it counts the whole table on every cache write (each rate-limited request)."""

    def __init__(self, now):
        self.now = now

    def count(self) -> int:
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM marketplace_cache WHERE expires < %s", [self.now])
            return cursor.fetchone()[0]

    def delete(self) -> None:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM marketplace_cache WHERE expires < %s", [self.now])


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
        if _uses_database_cache_table():
            targets["expired_cache_entries"] = _ExpiredCacheRows(now)
        counts = {name: rows.count() for name, rows in targets.items()}
        self.stdout.write(" ".join(f"{name}={count}" for name, count in counts.items()))
        self.stdout.write(f"execute={options['execute']}")
        if options["execute"]:
            with transaction.atomic():
                for rows in targets.values():
                    rows.delete()
