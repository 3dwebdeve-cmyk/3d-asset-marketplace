"""Unit tests for Phase K1 cutover gate."""

from __future__ import annotations

from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings

from accounts.models import User
from config.cutover_gate import run_cutover_gate
from payments.stripe_config import collect_stripe_config_report


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
    R2_ENABLED=False,
    SENTRY_DSN="",
    STRIPE_SECRET_KEY="",
    STRIPE_PUBLISHABLE_KEY="",
    STRIPE_WEBHOOK_SECRET="",
    E2E_STRIPE_SIMULATE=False,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "cutover-gate-local",
        }
    },
)
class CutoverGateLocalTests(TestCase):
    def test_debug_mode_cannot_pass_production_gate(self):
        from config.cutover_gate import _check_deploy, _check_django_deploy

        self.assertFalse(_check_deploy("production").ok)
        self.assertFalse(_check_django_deploy("production", enabled=True).ok)

    def test_local_profile_passes_without_host_secrets(self) -> None:
        result = run_cutover_gate(
            profile="local",
            django_deploy_check=False,
        )
        by_name = {c.name: c for c in result.checks}
        self.assertTrue(by_name["healthz"].ok, msg=by_name["healthz"].detail)
        self.assertTrue(by_name["search_postgres"].ok)
        self.assertTrue(result.all_ok)
        self.assertTrue(result.manual_reminders)

    def test_command_prints_ok(self) -> None:
        out = StringIO()
        call_command(
            "check_cutover",
            profile="local",
            skip_django_deploy_check=True,
            stdout=out,
        )
        text = out.getvalue()
        self.assertIn("cutover_gate OK (local)", text)
        self.assertIn("[OK] healthz", text)
        self.assertIn("Manual host steps", text)
        self.assertNotIn("sk_live_", text)


def _staging_deploy_report():
    from config.deploy_checks import DeployConfigReport

    return DeployConfigReport(
        debug=False,
        secret_key_length=48,
        secret_key_is_example=False,
        allowed_hosts=["shop.example.com"],
        allowed_hosts_wildcard=False,
        allowed_hosts_local_only=False,
        frontend_base_url="https://shop.example.com",
        frontend_is_local=False,
        cors_origins_count=1,
        cors_origins_local_only=False,
        public_api_base_url="https://shop.example.com",
        public_api_is_local=False,
        csrf_trusted_origins_count=1,
        secure_ssl_redirect=True,
        secure_hsts_seconds=31536000,
        allow_localhost_frontend=False,
        allow_console_email=False,
        db_password_weak=False,
        warnings=[],
    )


@override_settings(
    DEBUG=False,
    SECRET_KEY="unit-test-secret-key-not-for-production-use-32b",
    ALLOWED_HOSTS=["shop.example.com", "testserver"],
    FRONTEND_BASE_URL="https://shop.example.com",
    ALLOW_LOCALHOST_FRONTEND=False,
    ALLOW_CONSOLE_EMAIL=False,
    EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
    EMAIL_HOST="smtp.example.com",
    CONTACT_ADMIN_RECIPIENTS="ops@example.com",
    PROJECT_MESSAGE_ADMIN_RECIPIENTS="ops@example.com",
    CSRF_TRUSTED_ORIGINS=["https://shop.example.com"],
    CORS_ALLOWED_ORIGINS=["https://shop.example.com"],
    PUBLIC_API_BASE_URL="https://shop.example.com",
    SECURE_SSL_REDIRECT=True,
    SECURE_HSTS_SECONDS=31536000,
    SESSION_COOKIE_SECURE=True,
    CSRF_COOKIE_SECURE=True,
    R2_ENABLED=True,
    R2_PUBLIC_BASE_URL="https://cdn.example.com",
    SENTRY_DSN="https://examplePublicKey@o0.ingest.sentry.io/0",
    SENTRY_ENVIRONMENT="staging",
    STRIPE_SECRET_KEY="sk_test_cutover_gate_unit",
    STRIPE_PUBLISHABLE_KEY="pk_test_cutover_gate_unit",
    STRIPE_WEBHOOK_SECRET="whsec_cutover_gate_unit_secret",
    E2E_STRIPE_SIMULATE=False,
    DB_PASSWORD="strong-db-password-12",
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "cutover-gate-staging",
        }
    },
)
class CutoverGateStagingTests(TestCase):
    def setUp(self) -> None:
        call_command(
            "ensure_administrator",
            email="cutover-admin@example.com",
            password="CutoverGateAdmin1!",
        )

    @patch("config.cutover_gate.collect_deploy_config_report")
    def test_staging_passes_with_test_stripe(self, mock_deploy) -> None:
        mock_deploy.return_value = _staging_deploy_report()
        result = run_cutover_gate(
            profile="staging",
            django_deploy_check=False,
        )
        self.assertTrue(result.all_ok, msg=str(result.blocking_failures))
        stripe = next(c for c in result.checks if c.name == "stripe")
        self.assertTrue(stripe.ok)
        self.assertIn("secret=test", stripe.detail)
        search = next(c for c in result.checks if c.name == "search_postgres")
        self.assertTrue(search.ok)

    @patch("config.cutover_gate.collect_deploy_config_report")
    def test_staging_fails_without_administrator(self, mock_deploy) -> None:
        User.objects.filter(role__role_name="Administrator").delete()
        mock_deploy.return_value = _staging_deploy_report()
        result = run_cutover_gate(
            profile="staging",
            django_deploy_check=False,
        )
        auth = next(c for c in result.checks if c.name == "auth_frontend")
        ops = next(c for c in result.checks if c.name == "ops_staff")
        self.assertFalse(auth.ok)
        self.assertFalse(ops.ok)
        self.assertFalse(result.all_ok)


@override_settings(
    STRIPE_SECRET_KEY="sk_live_cutover_unit",
    STRIPE_PUBLISHABLE_KEY="pk_live_cutover_unit",
    STRIPE_WEBHOOK_SECRET="whsec_cutover_live_unit",
    E2E_STRIPE_SIMULATE=False,
)
class StripeLiveModeReportTests(SimpleTestCase):
    def test_require_live_mode_accepts_live_keys(self) -> None:
        report = collect_stripe_config_report(require_live_mode=True)
        self.assertEqual(report.secret_mode, "live")
        self.assertEqual(report.publishable_mode, "live")
        self.assertEqual(report.warnings, [])

    def test_require_live_rejects_test_keys(self) -> None:
        with override_settings(
            STRIPE_SECRET_KEY="sk_test_only",
            STRIPE_PUBLISHABLE_KEY="pk_test_only",
        ):
            report = collect_stripe_config_report(require_live_mode=True)
        self.assertTrue(
            any("sk_live_" in w for w in report.warnings),
            msg=report.warnings,
        )

    def test_mutually_exclusive_flags(self) -> None:
        with self.assertRaises(ValueError):
            collect_stripe_config_report(
                require_test_mode=True,
                require_live_mode=True,
            )


@override_settings(
    DEBUG=True,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "cutover-cmd",
        }
    },
)
class CutoverCommandFailTests(TestCase):
    @patch("accounts.management.commands.check_cutover.run_cutover_gate")
    def test_fail_on_warnings(self, mock_run) -> None:
        from config.cutover_gate import CutoverCheck, CutoverGateResult

        mock_run.return_value = CutoverGateResult(
            profile="staging",
            debug=False,
            checks=(
                CutoverCheck(
                    name="deploy",
                    ok=True,
                    detail="ok",
                    blocking=False,
                ),
            ),
            warnings=("advisory warning",),
            manual_reminders=(),
        )
        with self.assertRaises(CommandError):
            call_command(
                "check_cutover",
                profile="staging",
                fail_on_warnings=True,
                skip_django_deploy_check=True,
                stdout=StringIO(),
            )
