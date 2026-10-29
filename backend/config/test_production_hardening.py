import importlib
import io
import json
import os
from unittest.mock import MagicMock, patch
from zipfile import ZipFile

from celery import current_app
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.test import SimpleTestCase, TestCase, override_settings

from config.celery_utils import enqueue_after_commit
from config.sentry import before_send
from config.upload_security import (
    SCAN_MALWARE_FOUND,
    SCAN_UNAVAILABLE,
    inspect_product_content,
    scan_error_code,
    scan_upload,
)
from mail_log.management.commands.process_background_jobs import process_one
from mail_log.models import BackgroundJob
from products.testing import make_glb_bytes


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
        with self.assertRaises(ValidationError) as ctx:
            scan_upload(SimpleUploadedFile("model.zip", b"file"))
        self.assertEqual(scan_error_code(ctx.exception), SCAN_UNAVAILABLE)

    @override_settings(PACKAGE_SCAN_REQUIRED=True, PACKAGE_SCAN_HOST="clamav", PACKAGE_SCAN_PORT=3310)
    @patch("config.upload_security.socket.create_connection", side_effect=OSError())
    def test_unreachable_scanner_fails_closed(self, connection):
        with self.assertRaises(ValidationError) as ctx:
            scan_upload(SimpleUploadedFile("model.zip", b"file"))
        self.assertEqual(scan_error_code(ctx.exception), SCAN_UNAVAILABLE)

    @override_settings(PACKAGE_SCAN_HOST="clamav", PACKAGE_SCAN_PORT=3310)
    @patch("config.upload_security.socket.create_connection")
    def test_scan_verdicts_are_told_apart(self, connection):
        recv = connection.return_value.__enter__.return_value.recv
        for reply, code in (
            (b"stream: Eicar-Signature FOUND\0", SCAN_MALWARE_FOUND),
            (b"INSTREAM size limit exceeded. ERROR\0", SCAN_UNAVAILABLE),
        ):
            recv.side_effect = [reply]
            with self.subTest(reply=reply), self.assertRaises(ValidationError) as ctx:
                scan_upload(SimpleUploadedFile("model.zip", b"file"))
            self.assertEqual(scan_error_code(ctx.exception), code)

    @override_settings(PACKAGE_SCAN_REQUIRED=True, PACKAGE_SCAN_HOST="")
    def test_content_check_without_scan_still_checks_structure(self):
        with self.assertRaises(ValidationError) as ctx:
            inspect_product_content(SimpleUploadedFile("model.glb", b"glTF not a model"), ".glb", scan=False)
        self.assertIsNone(scan_error_code(ctx.exception))
        self.assertEqual(
            inspect_product_content(SimpleUploadedFile("model.glb", make_glb_bytes(7)), ".glb", scan=False), 7
        )

    def test_catalog_import_scan_switch_defaults_to_required(self):
        import config.settings as settings_module

        with patch.dict(os.environ):
            os.environ.pop("CATALOG_IMPORT_SCAN_REQUIRED", None)
            importlib.reload(settings_module)
            self.assertIs(settings_module.CATALOG_IMPORT_SCAN_REQUIRED, True)
        importlib.reload(settings_module)

    def test_startup_warns_when_catalog_imports_are_unscanned(self):
        from products.apps import warn_if_catalog_imports_unscanned

        with override_settings(PACKAGE_SCAN_REQUIRED=True, PACKAGE_SCAN_HOST="", CATALOG_IMPORT_SCAN_REQUIRED=False):
            with self.assertLogs("products.apps", "WARNING") as logs:
                warn_if_catalog_imports_unscanned()
        self.assertIn("WITHOUT a virus scan", logs.output[0])
        with override_settings(PACKAGE_SCAN_REQUIRED=True, PACKAGE_SCAN_HOST="", CATALOG_IMPORT_SCAN_REQUIRED=True):
            with self.assertNoLogs("products.apps", "WARNING"):
                warn_if_catalog_imports_unscanned()

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
