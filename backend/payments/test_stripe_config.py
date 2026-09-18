"""Phase B1 — check_stripe_config and stripe_config helpers."""

from __future__ import annotations

from io import StringIO
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings

from payments.stripe_config import (
    WEBHOOK_PATH,
    classify_publishable_key,
    classify_secret_key,
    collect_stripe_config_report,
    webhook_secret_looks_valid,
)
from payments.webhook_service import STRIPE_WEBHOOK_EVENT_TYPES


class StripeKeyClassifyTests(SimpleTestCase):
    def test_secret_modes(self) -> None:
        self.assertEqual(classify_secret_key(""), "empty")
        self.assertEqual(classify_secret_key("sk_test_abc"), "test")
        self.assertEqual(classify_secret_key("sk_live_abc"), "live")
        self.assertEqual(classify_secret_key("rk_test_abc"), "unknown")

    def test_publishable_modes(self) -> None:
        self.assertEqual(classify_publishable_key(""), "empty")
        self.assertEqual(classify_publishable_key("pk_test_abc"), "test")
        self.assertEqual(classify_publishable_key("pk_live_abc"), "live")
        self.assertEqual(classify_publishable_key("pk_other"), "unknown")

    def test_webhook_secret_prefix(self) -> None:
        self.assertFalse(webhook_secret_looks_valid(""))
        self.assertFalse(webhook_secret_looks_valid("whsec_"))
        self.assertTrue(webhook_secret_looks_valid("whsec_abc123"))


@override_settings(
    DEBUG=True,
    STRIPE_SECRET_KEY="",
    STRIPE_PUBLISHABLE_KEY="",
    STRIPE_WEBHOOK_SECRET="",
    E2E_STRIPE_SIMULATE=False,
)
class StripeConfigLocalEmptyTests(SimpleTestCase):
    def test_empty_ok_for_local_debug_without_require_test(self) -> None:
        report = collect_stripe_config_report(require_test_mode=False)
        self.assertEqual(report.secret_mode, "empty")
        self.assertEqual(report.warnings, [])
        self.assertEqual(report.webhook_path, WEBHOOK_PATH)
        self.assertEqual(
            set(report.event_types),
            set(STRIPE_WEBHOOK_EVENT_TYPES),
        )

    def test_require_test_mode_flags_missing_sandbox_keys(self) -> None:
        report = collect_stripe_config_report(require_test_mode=True)
        self.assertTrue(any("STRIPE_SECRET_KEY empty" in w for w in report.warnings))
        self.assertTrue(
            any("STRIPE_WEBHOOK_SECRET empty" in w for w in report.warnings)
        )


@override_settings(
    DEBUG=False,
    STRIPE_SECRET_KEY="",
    STRIPE_PUBLISHABLE_KEY="",
    STRIPE_WEBHOOK_SECRET="",
    E2E_STRIPE_SIMULATE=False,
)
class StripeConfigProdEmptyTests(SimpleTestCase):
    def test_empty_warns_when_debug_false(self) -> None:
        report = collect_stripe_config_report()
        self.assertTrue(any("STRIPE_SECRET_KEY is empty" in w for w in report.warnings))
        self.assertTrue(
            any("STRIPE_WEBHOOK_SECRET is empty" in w for w in report.warnings)
        )


@override_settings(
    DEBUG=True,
    STRIPE_SECRET_KEY="sk_test_dummy",
    STRIPE_PUBLISHABLE_KEY="pk_live_mismatch",
    STRIPE_WEBHOOK_SECRET="not_a_whsec",
    E2E_STRIPE_SIMULATE=False,
)
class StripeConfigMismatchTests(SimpleTestCase):
    def test_mode_mismatch_and_bad_webhook_secret(self) -> None:
        report = collect_stripe_config_report()
        joined = " ".join(report.warnings)
        self.assertIn("modes do not match", joined)
        self.assertIn("whsec_", joined)


@override_settings(
    DEBUG=True,
    STRIPE_SECRET_KEY="sk_live_dummy",
    STRIPE_PUBLISHABLE_KEY="pk_live_dummy",
    STRIPE_WEBHOOK_SECRET="whsec_testsecret",
    E2E_STRIPE_SIMULATE=False,
)
class StripeConfigLiveWithRequireTestTests(SimpleTestCase):
    def test_require_test_mode_rejects_live(self) -> None:
        report = collect_stripe_config_report(require_test_mode=True)
        self.assertTrue(any("Live Stripe keys" in w for w in report.warnings))


@override_settings(
    DEBUG=True,
    STRIPE_SECRET_KEY="sk_test_dummy",
    STRIPE_PUBLISHABLE_KEY="pk_test_dummy",
    STRIPE_WEBHOOK_SECRET="whsec_testsecret",
    E2E_STRIPE_SIMULATE=False,
)
class CheckStripeConfigCommandTests(TestCase):
    def test_ready_sandbox(self) -> None:
        out = StringIO()
        call_command(
            "check_stripe_config",
            require_test_mode=True,
            fail_on_warnings=True,
            stdout=out,
        )
        text = out.getvalue()
        self.assertIn("STRIPE_SECRET_KEY_mode=test", text)
        self.assertIn("webhook_path=/api/v1/payments/webhook/", text)
        self.assertIn("checkout.session.completed", text)
        self.assertIn("Stripe config looks ready", text)
        self.assertNotIn("sk_test_dummy", text)
        self.assertNotIn("whsec_testsecret", text)

    def test_fail_on_warnings_exits(self) -> None:
        with override_settings(STRIPE_SECRET_KEY=""):
            with self.assertRaises(CommandError):
                call_command(
                    "check_stripe_config",
                    require_test_mode=True,
                    fail_on_warnings=True,
                )

    def test_ping_requires_secret(self) -> None:
        with override_settings(STRIPE_SECRET_KEY=""):
            with self.assertRaises(CommandError) as ctx:
                call_command("check_stripe_config", ping=True)
        self.assertIn("STRIPE_SECRET_KEY is empty", str(ctx.exception))

    @patch(
        "payments.management.commands.check_stripe_config.ping_stripe_api",
        return_value="test",
    )
    def test_ping_success(self, _mock_ping: MagicMock) -> None:
        out = StringIO()
        call_command("check_stripe_config", ping=True, stdout=out)
        self.assertIn("Stripe API ping OK", out.getvalue())

    @patch(
        "payments.management.commands.check_stripe_config.ping_stripe_api",
        side_effect=RuntimeError("network down"),
    )
    def test_ping_surfaces_errors(self, _mock_ping: MagicMock) -> None:
        with self.assertRaises(CommandError) as ctx:
            call_command("check_stripe_config", ping=True)
        self.assertIn("Balance.retrieve failed", str(ctx.exception))
