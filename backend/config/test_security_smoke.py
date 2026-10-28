"""Unit tests for Phase H2 security smoke."""

from __future__ import annotations

from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from config.security_smoke import run_security_smoke


@override_settings(
    DEBUG=True,
    CSRF_TRUSTED_ORIGINS=["http://localhost:5173"],
    CORS_ALLOWED_ORIGINS=["http://localhost:5173", "http://127.0.0.1:5173"],
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "security-smoke-tests",
        }
    },
    STRIPE_WEBHOOK_SECRET="whsec_security_smoke_test_secret",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class SecuritySmokeRunTests(TestCase):
    def test_smoke_passes_core_controls(self) -> None:
        result = run_security_smoke(django_deploy_check=False)
        by_name = {c.name: c for c in result.checks}
        for name in (
            "login_throttle",
            "unauth_download",
            "unsigned_private_object",
            "bad_webhook_signature",
            "cors_csrf_allowlist",
            "django_admin_locked",
            "openapi_gated",
        ):
            check = by_name[name]
            self.assertTrue(check.ok, msg=f"{name}: {check.detail}")
        self.assertTrue(result.all_ok)

    def test_command_prints_ok(self) -> None:
        out = StringIO()
        call_command(
            "check_security_smoke",
            skip_django_deploy_check=True,
            stdout=out,
        )
        text = out.getvalue()
        self.assertIn("security_smoke OK", text)
        self.assertIn("[OK] login_throttle", text)
        self.assertNotIn("whsec_security_smoke", text)


@override_settings(
    DEBUG=False,
    SECURE_SSL_REDIRECT=False,
    SESSION_COOKIE_SECURE=True,
    CSRF_COOKIE_SECURE=True,
    CSRF_TRUSTED_ORIGINS=["https://shop.example.com"],
    CORS_ALLOWED_ORIGINS=["https://shop.example.com"],
    ALLOWED_HOSTS=["shop.example.com"],
    SECRET_KEY="unit-test-secret-key-not-for-production-use-32b",
    STRIPE_WEBHOOK_SECRET="whsec_security_smoke_test_secret",
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "security-smoke-prodish",
        }
    },
)
class SecuritySmokeProdLikeTests(TestCase):
    def test_cors_preflight_allows_checkout_idempotency_key(self) -> None:
        response = APIClient().options(
            reverse("payments:checkout"),
            HTTP_ORIGIN="https://shop.example.com",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization,content-type,idempotency-key",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "https://shop.example.com",
        )
        allowed = response.headers.get("Access-Control-Allow-Headers", "").lower()
        self.assertIn("idempotency-key", allowed)

    def test_cors_wildcard_fails(self) -> None:
        with override_settings(CORS_ALLOWED_ORIGINS=["*"]):
            result = run_security_smoke(django_deploy_check=False)
            cors = next(c for c in result.checks if c.name == "cors_csrf_allowlist")
            self.assertFalse(cors.ok)

    def test_bad_webhook_does_not_fulfill(self) -> None:
        from payments.models import Payment, StripeWebhookEvent

        before_e = StripeWebhookEvent.objects.count()
        before_p = Payment.objects.count()
        client = APIClient()
        response = client.post(
            reverse("payments:webhook"),
            data=b"{}",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="t=1,v1=deadbeef",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(StripeWebhookEvent.objects.count(), before_e)
        self.assertEqual(Payment.objects.count(), before_p)


class SecuritySmokeCommandFailTests(SimpleTestCase):
    @patch("accounts.management.commands.check_security_smoke.run_security_smoke")
    def test_command_fails_on_blocking(self, mock_run) -> None:
        from config.security_smoke import SecuritySmokeCheck, SecuritySmokeResult

        mock_run.return_value = SecuritySmokeResult(
            checks=(
                SecuritySmokeCheck(
                    name="login_throttle",
                    ok=False,
                    detail="expected fail",
                ),
            ),
            debug=True,
            warnings=(),
        )
        with self.assertRaises(CommandError):
            call_command("check_security_smoke", skip_django_deploy_check=True)
