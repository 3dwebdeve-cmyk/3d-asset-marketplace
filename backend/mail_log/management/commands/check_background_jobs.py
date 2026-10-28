from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from mail_log.models import BackgroundJob, BackgroundWorker


class Command(BaseCommand):
    help = "Require a live outbox worker and no exhausted delivery retries."

    def handle(self, *args, **options):
        now = timezone.now()
        expected = int(getattr(settings, "BACKGROUND_JOBS_EXPECTED_WORKERS", 1))
        live = BackgroundWorker.objects.filter(heartbeat_at__gte=now - timedelta(seconds=60)).count()
        if live < expected:
            raise CommandError(f"Only {live}/{expected} background workers have a live heartbeat.")
        if BackgroundJob.objects.filter(status="failed").exists():
            raise CommandError("Background jobs exhausted retries; investigate delivery failures.")
        if BackgroundJob.objects.filter(
            status="queued", available_at__lte=now - timedelta(
                seconds=settings.BACKGROUND_JOBS_MAX_READY_AGE_SECONDS
            )
        ).exists():
            raise CommandError("Background job backlog exceeds the ready-age threshold.")
        if BackgroundJob.objects.filter(status="running", lease_until__lt=now).exists():
            raise CommandError("Background jobs have expired leases; investigate workers.")
        if BackgroundJob.objects.filter(
            status="running", started_at__lt=now - timedelta(
                seconds=settings.BACKGROUND_JOBS_MAX_RUN_SECONDS
            )
        ).exists():
            raise CommandError("A background job exceeds the run-time threshold.")
        self.stdout.write("background jobs ready")
