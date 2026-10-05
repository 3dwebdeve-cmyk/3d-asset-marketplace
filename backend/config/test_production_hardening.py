import io
import json
from unittest.mock import MagicMock, patch
from zipfile import ZipFile

from celery import current_app
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.test import SimpleTestCase, TestCase, override_settings

from config.celery_utils import enqueue_after_commit
from config.sentry import before_send
from config.upload_security import inspect_product_content, scan_upload
from mail_log.management.commands.process_background_jobs import process_one
from mail_log.models import BackgroundJob


class UploadSecurityTests(SimpleTestCase):
    def test_spoofed_glb_is_rejected(self):
        with self.assertRaises(ValidationError):
            inspect_product_content(SimpleUploadedFile("model.glb", b"glTF not a model"), ".glb")

    def test_external_gltf_uri_is_rejected(self):
        document = {"asset": {"version": "2.0"}, "buffers": [{"uri": "https://attacker.invalid/file"}]}
        with self.assertRaises(ValidationError):
            inspect_product_content(SimpleUploadedFile("model.gltf", json.dumps(document).encode()), ".gltf")

    def test_zip_traversal_is_rejected(self):
        stream = io.BytesIO()
        with ZipFile(stream, "w") as archive:
            archive.writestr("../../secret", "content")
        with self.assertRaises(ValidationError):
            inspect_product_content(SimpleUploadedFile("model.zip", stream.getvalue(), content_type="application/zip"), ".zip")

    @override_settings(PACKAGE_SCAN_REQUIRED=True, PACKAGE_SCAN_HOST="")
    def test_required_scanner_fails_closed(self):
        with self.assertRaises(ValidationError):
            scan_upload(SimpleUploadedFile("model.zip", b"file"))

    @override_settings(PACKAGE_SCAN_REQUIRED=True, PACKAGE_SCAN_HOST="clamav", PACKAGE_SCAN_PORT=3310)
    @patch("config.upload_security.socket.create_connection", side_effect=OSError())
    def test_unreachable_scanner_fails_closed(self, connection):
        with self.assertRaises(ValidationError):
            scan_upload(SimpleUploadedFile("model.zip", b"file"))

    def test_telemetry_scrubs_sensitive_paths_queries_and_breadcrumbs(self):
        event = {"request": {"url": "https://example.test/reset-password/user/secret"},
                 "breadcrumbs": [{"data": {"url": "https://example.test/file?X-Amz-Signature=secret"}}],
                 "transaction": "/verify-email/user/secret"}
        scrubbed = before_send(event, {})
        self.assertNotIn("secret", json.dumps(scrubbed))


@override_settings(BACKGROUND_JOBS_TEST_EAGER=False)
class OutboxTests(TestCase):
    def setUp(self):
        self.task = MagicMock()
        self.task.name = "tests.outbox_delivery"

    def test_job_rolls_back_with_business_transaction(self):
        try:
            with transaction.atomic():
                enqueue_after_commit(self.task, "argument")
                raise ValueError("rollback")
        except ValueError:
            pass
        self.assertFalse(BackgroundJob.objects.exists())
        self.task.delay.assert_not_called()

    def test_success_deletes_sensitive_payload(self):
        enqueue_after_commit(self.task, "argument")
        with patch.dict(current_app.tasks, {self.task.name: self.task}):
            self.assertTrue(process_one())
        self.task.run.assert_called_once_with("argument")
        self.assertFalse(BackgroundJob.objects.exists())

    def test_failure_preserves_job_for_retry(self):
        self.task.run.side_effect = RuntimeError("delivery failed")
        enqueue_after_commit(self.task, "argument")
        with patch.dict(current_app.tasks, {self.task.name: self.task}):
            process_one()
        job = BackgroundJob.objects.get()
        self.assertEqual(job.status, "queued")
        self.assertEqual(job.attempts, 1)
