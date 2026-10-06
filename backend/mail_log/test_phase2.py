"""Outbox operations, lease recovery and redacted inspection."""

from datetime import timedelta
from io import StringIO
from unittest.mock import MagicMock, patch
import uuid

from celery import current_app
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone

from mail_log.management.commands.process_background_jobs import process_one
from mail_log.models import BackgroundJob, BackgroundWorker


class OutboxRecoveryTests(TestCase):
    def test_expired_lease_runs_and_removes_sensitive_payload(self):
        task = MagicMock()
        job = BackgroundJob.objects.create(
            task_name="tests.phase2", args=["secret-token"], status="running",
            lease_id=uuid.uuid4(), lease_until=timezone.now() - timedelta(seconds=1),
        )
        with patch.dict(current_app.tasks, {"tests.phase2": task}):
            self.assertTrue(process_one())
        task.run.assert_called_once_with("secret-token")
        self.assertFalse(BackgroundJob.objects.filter(pk=job.pk).exists())

    def test_retry_exhaustion_and_explicit_requeue(self):
        task = MagicMock()
        task.run.side_effect = RuntimeError("smtp failed")
        job = BackgroundJob.objects.create(task_name="tests.phase2", attempts=4)
        with patch.dict(current_app.tasks, {"tests.phase2": task}):
            process_one()
        job.refresh_from_db()
        self.assertEqual(job.status, "failed")
        output = StringIO()
        call_command("manage_background_jobs", "requeue", job_id=job.pk, stdout=output)
        job.refresh_from_db()
        self.assertEqual(job.status, "failed")
        call_command("manage_background_jobs", "requeue", job_id=job.pk, execute=True, stdout=output)
        job.refresh_from_db()
        self.assertEqual((job.status, job.attempts), ("queued", 0))

    def test_inspection_redacts_payload_and_health_checks_backlog(self):
        BackgroundJob.objects.create(task_name="tests.phase2", args=["secret-token"])
        output = StringIO()
        call_command("manage_background_jobs", "inspect", stdout=output)
        self.assertNotIn("secret-token", output.getvalue())
        worker = BackgroundWorker.objects.create()
        call_command("check_background_jobs", stdout=StringIO())
        BackgroundJob.objects.update(available_at=timezone.now() - timedelta(minutes=6))
        with self.assertRaises(CommandError):
            call_command("check_background_jobs", stdout=StringIO())
        BackgroundJob.objects.all().delete()
        worker.heartbeat_at = timezone.now() - timedelta(minutes=2)
        worker.save(update_fields=["heartbeat_at"])
        with self.assertRaises(CommandError):
            call_command("check_background_jobs", stdout=StringIO())

    @override_settings(BACKGROUND_JOBS_EXPECTED_WORKERS=2)
    def test_health_requires_each_expected_worker_and_flags_stuck_job(self):
        BackgroundWorker.objects.create()
        with self.assertRaises(CommandError):
            call_command("check_background_jobs", stdout=StringIO())
        BackgroundWorker.objects.create()
        call_command("check_background_jobs", stdout=StringIO())
        BackgroundJob.objects.create(
            task_name="tests.phase2", status="running", lease_id=uuid.uuid4(),
            lease_until=timezone.now() + timedelta(minutes=5),
            started_at=timezone.now() - timedelta(minutes=31),
        )
        with self.assertRaises(CommandError):
            call_command("check_background_jobs", stdout=StringIO())

    def test_prune_is_explicit_and_only_removes_old_failed_payloads(self):
        old = BackgroundJob.objects.create(task_name="tests.phase2", status="failed", args=["secret-token"])
        BackgroundJob.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=31))
        queued = BackgroundJob.objects.create(task_name="tests.phase2", args=["new-token"])
        call_command("manage_background_jobs", "prune", older_than_days=30, stdout=StringIO())
        self.assertTrue(BackgroundJob.objects.filter(pk=old.pk).exists())
        call_command(
            "manage_background_jobs", "prune", older_than_days=30,
            execute=True, stdout=StringIO(),
        )
        self.assertFalse(BackgroundJob.objects.filter(pk=old.pk).exists())
        self.assertTrue(BackgroundJob.objects.filter(pk=queued.pk).exists())

    def test_worker_tracks_job_and_clears_heartbeat_state(self):
        worker = BackgroundWorker.objects.create()
        task = MagicMock()
        BackgroundJob.objects.create(task_name="tests.phase2")
        with patch.dict(current_app.tasks, {"tests.phase2": task}):
            self.assertTrue(process_one(worker_id=worker.pk))
        worker.refresh_from_db()
        self.assertIsNone(worker.current_job_id)
        self.assertFalse(BackgroundJob.objects.exists())
