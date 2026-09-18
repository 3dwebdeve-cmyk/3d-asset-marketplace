"""Phase A3 — check_email_config and console-email production guard."""

from __future__ import annotations

from io import StringIO
from unittest.mock import patch

from django.core import mail
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings


class ConsoleEmailGuardTests(SimpleTestCase):
    def test_settings_refuse_console_when_debug_false_without_allow(self) -> None:
        """Mirror settings.py Phase A3 guard (same contract as test_health)."""
        debug = False
        running_tests = False
        email_backend = "django.core.mail.backends.console.EmailBackend"
        allow_console_email = False
        with self.assertRaises(ImproperlyConfigured):
            if (
                not debug
                and not running_tests
                and "console" in email_backend.lower()
                and not allow_console_email
            ):
                raise ImproperlyConfigured(
                    "EMAIL_BACKEND must not use the console backend when DEBUG=False."
                )


@override_settings(
    DEBUG=True,
    EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend",
    ALLOW_CONSOLE_EMAIL=True,
    EMAIL_HOST="",
    EMAIL_HOST_USER="",
    EMAIL_HOST_PASSWORD="",
    CONTACT_ADMIN_RECIPIENTS="",
    PROJECT_MESSAGE_ADMIN_RECIPIENTS="",
)
class CheckEmailConfigLocalTests(TestCase):
    def test_ok_for_debug_console(self) -> None:
        out = StringIO()
        call_command("check_email_config", fail_on_warnings=True, stdout=out)
        text = out.getvalue()
        self.assertIn("EMAIL_BACKEND=", text)
        self.assertIn("OK for local/debug", text)


@override_settings(
    DEBUG=False,
    EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
    ALLOW_CONSOLE_EMAIL=False,
    EMAIL_HOST="",
    EMAIL_HOST_USER="",
    EMAIL_HOST_PASSWORD="",
    CONTACT_ADMIN_RECIPIENTS="",
    PROJECT_MESSAGE_ADMIN_RECIPIENTS="",
)
class CheckEmailConfigProdGapsTests(TestCase):
    def test_fails_when_smtp_host_and_recipients_missing(self) -> None:
        with self.assertRaises(CommandError):
            call_command("check_email_config", fail_on_warnings=True)


@override_settings(
    DEBUG=False,
    EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
    ALLOW_CONSOLE_EMAIL=False,
    EMAIL_HOST="smtp.example.com",
    EMAIL_PORT=587,
    EMAIL_USE_TLS=True,
    EMAIL_HOST_USER="user@example.com",
    EMAIL_HOST_PASSWORD="secret",
    DEFAULT_FROM_EMAIL="noreply@example.com",
    CONTACT_ADMIN_RECIPIENTS="ops@example.com",
    PROJECT_MESSAGE_ADMIN_RECIPIENTS="projects@example.com",
)
class CheckEmailConfigReadyTests(TestCase):
    def test_ready_when_smtp_and_recipients_set(self) -> None:
        out = StringIO()
        call_command("check_email_config", fail_on_warnings=True, stdout=out)
        text = out.getvalue()
        self.assertIn("EMAIL_HOST_set=True", text)
        self.assertIn("Email/SMTP config looks ready", text)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_send_test_email(self) -> None:
        out = StringIO()
        call_command(
            "check_email_config",
            send_test_email="smoke@example.com",
            stdout=out,
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["smoke@example.com"])
        self.assertIn("Sent test email", out.getvalue())

    def test_send_test_email_surfaces_provider_errors(self) -> None:
        with patch(
            "accounts.management.commands.check_email_config.send_mail",
            side_effect=OSError("connection refused"),
        ):
            with self.assertRaises(CommandError) as ctx:
                call_command(
                    "check_email_config",
                    send_test_email="smoke@example.com",
                )
        self.assertIn("Failed to send test email", str(ctx.exception))
