"""Deliver committed outbox jobs with retry/backoff and recoverable leases."""

import logging
import threading
import time
import uuid
from datetime import timedelta

from celery import current_app
from django.core.management.base import BaseCommand
from django.db import close_old_connections, transaction
from django.db.models import Q
from django.utils import timezone

from mail_log.models import BackgroundJob, BackgroundWorker

logger = logging.getLogger(__name__)


def _heartbeat(worker_id, job_id=None, lease_id=None):
    now = timezone.now()
    BackgroundWorker.objects.filter(pk=worker_id).update(heartbeat_at=now, current_job_id=job_id)
    if job_id is not None:
        BackgroundJob.objects.filter(pk=job_id, lease_id=lease_id, status="running").update(
            lease_until=now + timedelta(minutes=10)
        )


def process_one(*, worker_id=None):
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
        job.started_at = now
        job.save()
    stopped = threading.Event()
    heartbeat_thread = None
    if worker_id is not None:
        def renew():
            while not stopped.wait(20):
                try:
                    close_old_connections()
                    _heartbeat(worker_id, job.pk, lease)
                except Exception:
                    logger.exception("background_worker_heartbeat_failed worker_id=%s", worker_id)
            close_old_connections()

        _heartbeat(worker_id, job.pk, lease)
        heartbeat_thread = threading.Thread(target=renew, daemon=True)
        heartbeat_thread.start()
    try:
        current_app.tasks[job.task_name].run(*job.args, **job.kwargs)
    except Exception:
        # Do not log task arguments (they can contain password-reset tokens).
        logger.error("background_job_failed job_id=%s attempt=%s", job.pk, job.attempts)
        final = job.attempts >= 5
        updates = {
            "status": "failed" if final else "queued",
            "available_at": timezone.now() + timedelta(seconds=min(3600, 60 * 2**job.attempts)),
            "lease_until": None,
            "started_at": None,
        }
        if final:
            # Retries are exhausted: drop the payload so tokens do not sit in the table.
            updates.update(args=[], kwargs={})
        BackgroundJob.objects.filter(pk=job.pk, lease_id=lease).update(**updates)
    else:
        # Remove sensitive payloads immediately after successful delivery.
        BackgroundJob.objects.filter(pk=job.pk, lease_id=lease).delete()
    finally:
        stopped.set()
        if heartbeat_thread is not None:
            heartbeat_thread.join(timeout=5)
            _heartbeat(worker_id)
    return True


class Command(BaseCommand):
    help = "Process the PostgreSQL transactional email outbox."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        current_app.autodiscover_tasks(force=True)
        worker = BackgroundWorker.objects.create()
        try:
            while True:
                close_old_connections()
                _heartbeat(worker.pk)
                worked = process_one(worker_id=worker.pk)
                if options["once"]:
                    return
                if not worked:
                    time.sleep(2)
        finally:
            BackgroundWorker.objects.filter(pk=worker.pk).delete()
