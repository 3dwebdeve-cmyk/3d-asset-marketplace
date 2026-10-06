"""Alert on low application disk space or an oversized database."""

import shutil

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = "Check media disk free space and PostgreSQL database size thresholds."

    def handle(self, *args, **options):
        free_mb = shutil.disk_usage(settings.MEDIA_ROOT).free // (1024 * 1024)
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_database_size(current_database())")
            db_mb = cursor.fetchone()[0] // (1024 * 1024)
        min_free = getattr(settings, "MIN_DISK_FREE_MB", 1024)
        max_db = getattr(settings, "MAX_DB_SIZE_MB", 10240)
        self.stdout.write(f"disk_free_mb={free_mb} db_size_mb={db_mb}")
        if free_mb < min_free or db_mb > max_db:
            raise CommandError("Capacity threshold exceeded.")
