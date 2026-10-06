"""Inspect and recover the transactional email outbox without exposing payloads."""

import logging
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from mail_log.models import BackgroundJob, BackgroundWorker

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Inspect jobs; explicitly requeue failed jobs or prune old failed payloads."

    def add_arguments(self, parser):
        parser.add_argument("action", choices=["inspect", "requeue", "prune"])
        parser.add_argument("--job-id", type=int)
        parser.add_argument("--older-than-days", type=int, default=30)
        parser.add_argument("--execute", action="store_true")

    def handle(self, *args, **options):
        action = options["action"]
        if action == "inspect":
            for job in BackgroundJob.objects.order_by("created_at")[:100]:
                self.stdout.write(
                    f"id={job.pk} task={job.task_name} status={job.status} "
                    f"attempts={job.attempts} created={job.created_at.isoformat()} "
                    f"available={job.available_at.isoformat()} lease_until={job.lease_until}"
                )
            for worker in BackgroundWorker.objects.order_by("-heartbeat_at")[:20]:
                self.stdout.write(
                    f"worker={worker.pk} heartbeat={worker.heartbeat_at.isoformat()} "
                    f"job={worker.current_job_id}"
                )
            return
        if action == "requeue":
            if options["job_id"] is None:
                raise CommandError("--job-id is required for requeue")
            with transaction.atomic():
                job = BackgroundJob.objects.select_for_update().filter(pk=options["job_id"]).first()
                if job is None or job.status != "failed":
                    raise CommandError("Only an existing failed job can be requeued")
                self.stdout.write(f"job={job.pk} action=requeue execute={options['execute']}")
                if options["execute"]:
                    job.status = "queued"
                    job.attempts = 0
                    job.available_at = timezone.now()
                    job.lease_id = None
                    job.lease_until = None
                    job.started_at = None
                    job.save(update_fields=["status", "attempts", "available_at", "lease_id", "lease_until", "started_at"])
                    logger.warning("background_job_requeued job_id=%s", job.pk)
            return
        days = options["older_than_days"]
        if days < 1:
            raise CommandError("--older-than-days must be positive")
        queryset = BackgroundJob.objects.filter(
            status="failed", created_at__lt=timezone.now() - timedelta(days=days)
        )
        count = queryset.count()
        self.stdout.write(f"failed_jobs_to_prune={count} execute={options['execute']}")
        if options["execute"]:
            queryset.delete()
            BackgroundWorker.objects.filter(
                heartbeat_at__lt=timezone.now() - timedelta(days=days)
            ).delete()
            logger.warning("background_jobs_pruned count=%s older_than_days=%s", count, days)
