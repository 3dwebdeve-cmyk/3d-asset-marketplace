"""Phase A3 — check_email_config and console-email production guard."""

from __future__ import annotations

from io import StringIO
from unittest.mock import patch

from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings

from config.settings_guard_testing import import_settings


class ConsoleEmailGuardTests(SimpleTestCase):
    """Imports the real settings module, so a change to the guard is caught."""

    console = "django.core.mail.backends.console.EmailBackend"

    def test_settings_refuse_console_when_debug_false_without_allow(self) -> None:
        result = import_settings(EMAIL_BACKEND=self.console, ALLOW_CONSOLE_EMAIL="False")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must not use the console backend", result.stderr)

    def test_settings_allow_console_when_explicitly_permitted(self) -> None:
        result = import_settings(EMAIL_BACKEND=self.console, ALLOW_CONSOLE_EMAIL="True")
        self.assertEqual(result.returncode, 0, result.stderr)


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
    BREVO_API_KEY="",
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
    EMAIL_BACKEND="config.brevo_email_backend.BrevoAPIEmailBackend",
    ALLOW_CONSOLE_EMAIL=False,
    BREVO_API_KEY="x" * 40,
    EMAIL_HOST="",
    EMAIL_HOST_USER="",
    EMAIL_HOST_PASSWORD="",
    DEFAULT_FROM_EMAIL="webmaster@example.com",
    CONTACT_ADMIN_RECIPIENTS="ops@example.com",
    PROJECT_MESSAGE_ADMIN_RECIPIENTS="projects@example.com",
)
class CheckEmailConfigBrevoReadyTests(TestCase):
    def test_ready_when_brevo_key_set(self) -> None:
        out = StringIO()
        call_command("check_email_config", fail_on_warnings=True, stdout=out)
        text = out.getvalue()
        self.assertIn("BREVO_API_KEY_set=True", text)
        self.assertIn("Email/Brevo config looks ready", text)


@override_settings(
    DEBUG=False,
    EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
    ALLOW_CONSOLE_EMAIL=False,
    BREVO_API_KEY="",
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


@override_settings(
    DEBUG=False,
    EMAIL_BACKEND="config.brevo_email_backend.BrevoAPIEmailBackend",
    ALLOW_CONSOLE_EMAIL=False,
    BREVO_API_KEY="x" * 40,
    DEFAULT_FROM_EMAIL="AssetHive3D <Shop.Team@GMAIL.com>",
    CONTACT_ADMIN_RECIPIENTS="ops@example.com",
    PROJECT_MESSAGE_ADMIN_RECIPIENTS="projects@example.com",
)
class CheckEmailConfigSenderDomainTests(TestCase):
    def test_free_mailbox_sender_blocks_launch(self) -> None:
        out = StringIO()
        with self.assertRaises(CommandError):
            call_command("check_email_config", fail_on_warnings=True, stdout=out)
        text = out.getvalue()
        self.assertIn("gmail.com, a free mailbox domain", text)
        self.assertNotIn("Brevo API backend configured", text)

    @override_settings(DEFAULT_FROM_EMAIL="AssetHive3D <noreply@assethive3d.com>")
    def test_own_domain_sender_is_ready(self) -> None:
        out = StringIO()
        call_command("check_email_config", fail_on_warnings=True, stdout=out)
        self.assertIn("Email/Brevo config looks ready", out.getvalue())

    @override_settings(DEBUG=True)
    def test_free_mailbox_allowed_in_local_debug(self) -> None:
        out = StringIO()
        call_command("check_email_config", fail_on_warnings=True, stdout=out)
        self.assertNotIn("free mailbox", out.getvalue())
