"""Unit tests for Phase K2 rollback rehearsal gate."""

from __future__ import annotations

from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings

from config.rollback_rehearsal import (
    _tag_looks_mutable,
    run_rollback_rehearsal,
)


@override_settings(
    DEBUG=True,
    SECRET_KEY="unit-test-secret-key-not-for-production-use-32b",
    ALLOWED_HOSTS=["localhost", "127.0.0.1", "testserver"],
    FRONTEND_BASE_URL="http://localhost:5173",
    ALLOW_LOCALHOST_FRONTEND=True,
    ALLOW_CONSOLE_EMAIL=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    CSRF_TRUSTED_ORIGINS=["http://localhost:5173"],
    CORS_ALLOWED_ORIGINS=["http://localhost:5173"],
    STRIPE_SECRET_KEY="sk_test_rollback_unit",
    STRIPE_PUBLISHABLE_KEY="pk_test_rollback_unit",
    STRIPE_WEBHOOK_SECRET="whsec_rollback_unit",
    E2E_STRIPE_SIMULATE=False,
    LEGAL_DOCUMENT_VERSIONS={"terms": "2026-09-18", "privacy": "2026-09-18"},
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "rollback-rehearsal-local",
        }
    },
)
class RollbackRehearsalLocalTests(TestCase):
    def test_local_profile_passes(self) -> None:
        result = run_rollback_rehearsal(profile="local")
        by_name = {c.name: c for c in result.checks}
        self.assertTrue(by_name["healthz"].ok, msg=by_name["healthz"].detail)
        self.assertTrue(
            by_name["purchase_path"].ok, msg=by_name["purchase_path"].detail
        )
        self.assertTrue(
            by_name["webhook_idempotency"].ok,
            msg=by_name["webhook_idempotency"].detail,
        )
        self.assertTrue(result.all_ok)
        self.assertTrue(result.manual_reminders)
        self.assertIn("rollback_compose", " ".join(result.manual_reminders))

    def test_command_prints_ok(self) -> None:
        out = StringIO()
        call_command(
            "check_rollback_rehearsal",
            profile="local",
            stdout=out,
        )
        text = out.getvalue()
        self.assertIn("rollback_rehearsal OK (local)", text)
        self.assertIn("[OK] healthz", text)
        self.assertIn("[OK] purchase_path", text)
        self.assertIn("[OK] webhook_idempotency", text)
        self.assertIn("Manual host steps", text)
        self.assertNotIn("sk_test_", text)
        self.assertNotIn("whsec_", text)

    def test_latest_tag_advisory_local(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "WEB_IMAGE": "marketplace-web:latest",
                "FRONTEND_IMAGE": "marketplace-frontend:latest",
            },
            clear=False,
        ):
            result = run_rollback_rehearsal(profile="local")
        by_name = {c.name: c for c in result.checks}
        self.assertFalse(by_name["immutable_tags"].ok)
        self.assertFalse(by_name["immutable_tags"].blocking)
        # Other checks still run and should pass.
        self.assertTrue(by_name["healthz"].ok)
        self.assertTrue(result.all_ok)

    def test_latest_tag_blocking_staging(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "WEB_IMAGE": "ghcr.io/org/marketplace-web:latest",
                "FRONTEND_IMAGE": "ghcr.io/org/marketplace-frontend:v1",
            },
            clear=False,
        ):
            result = run_rollback_rehearsal(profile="staging")
        by_name = {c.name: c for c in result.checks}
        self.assertFalse(by_name["immutable_tags"].ok)
        self.assertTrue(by_name["immutable_tags"].blocking)
        self.assertFalse(result.all_ok)

    def test_fail_on_warnings_with_debug_staging(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "WEB_IMAGE": "marketplace-web:2026-09-19-abc1234",
                "FRONTEND_IMAGE": "marketplace-frontend:2026-09-19-abc1234",
            },
            clear=False,
        ):
            out = StringIO()
            with self.assertRaises(CommandError) as ctx:
                call_command(
                    "check_rollback_rehearsal",
                    profile="staging",
                    fail_on_warnings=True,
                    stdout=out,
                )
        self.assertIn("warning", str(ctx.exception).lower())


class TagMutableHelperTests(SimpleTestCase):
    def test_latest_detection(self) -> None:
        self.assertTrue(_tag_looks_mutable(""))
        self.assertTrue(_tag_looks_mutable("latest"))
        self.assertTrue(_tag_looks_mutable("marketplace-web:latest"))
        self.assertFalse(_tag_looks_mutable("marketplace-web:local"))
        self.assertFalse(
            _tag_looks_mutable("ghcr.io/org/marketplace-web:2026-09-19-abc")
        )
