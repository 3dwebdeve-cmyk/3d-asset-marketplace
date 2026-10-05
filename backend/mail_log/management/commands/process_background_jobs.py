"""Deliver committed outbox jobs with retry/backoff and recoverable leases."""

import logging
import time
import uuid
from datetime import timedelta

from celery import current_app
from django.core.cache import cache
from django.core.management.base import BaseCommand
from django.db import close_old_connections, transaction
from django.db.models import Q
from django.utils import timezone

from mail_log.models import BackgroundJob

logger = logging.getLogger(__name__)


def process_one():
    now = timezone.now()
    lease = uuid.uuid4()
    with transaction.atomic():
        job = BackgroundJob.objects.select_for_update(skip_locked=True).filter(
            Q(status="queued", available_at__lte=now)
            | Q(status="running", lease_until__lt=now),
        ).order_by("pk").first()
        if job is None:
            return False
        job.status = "running"
        job.attempts += 1
        job.lease_id = lease
        job.lease_until = now + timedelta(minutes=10)
        job.save()
    try:
        current_app.tasks[job.task_name].run(*job.args, **job.kwargs)
    except Exception:
        # Do not log task arguments (they can contain password-reset tokens).
        logger.error("background_job_failed job_id=%s attempt=%s", job.pk, job.attempts)
        BackgroundJob.objects.filter(pk=job.pk, lease_id=lease).update(
            status="failed" if job.attempts >= 5 else "queued",
            available_at=timezone.now() + timedelta(seconds=min(3600, 60 * 2**job.attempts)),
            lease_until=None,
        )
    else:
        # Remove sensitive payloads immediately after successful delivery.
        BackgroundJob.objects.filter(pk=job.pk, lease_id=lease).delete()
    return True


class Command(BaseCommand):
    help = "Process the PostgreSQL transactional email outbox."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        current_app.autodiscover_tasks(force=True)
        while True:
            close_old_connections()
            cache.set("background_jobs:heartbeat", time.time(), timeout=60)
            worked = process_one()
            if options["once"]:
                return
            if not worked:
                time.sleep(2)
