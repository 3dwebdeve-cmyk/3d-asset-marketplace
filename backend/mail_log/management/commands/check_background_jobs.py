import time

from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from mail_log.models import BackgroundJob


class Command(BaseCommand):
    help = "Require a live outbox worker and no exhausted delivery retries."

    def handle(self, *args, **options):
        heartbeat = cache.get("background_jobs:heartbeat")
        if not heartbeat or time.time() - float(heartbeat) > 60:
            raise CommandError("Background worker heartbeat is missing or stale.")
        if BackgroundJob.objects.filter(status="failed").exists():
            raise CommandError("Background jobs exhausted retries; investigate delivery failures.")
        self.stdout.write("background jobs ready")
