import os
import subprocess
import sys
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings


class ScannerStartupTests(SimpleTestCase):
    def test_production_settings_load_without_scanner_and_keep_scanning_required(self):
        env = os.environ.copy()
        env.update({
            "DEBUG": "False", "DEPLOYMENT_PROFILE": "production",
            "SECRET_KEY": "startup-regression-test-key-not-used-in-production-123456789",
            "E2E_STRIPE_SIMULATE": "False", "PACKAGE_SCAN_HOST": "",
            "DJANGO_ADMIN_ENABLED": "False", "ADMIN_CONSOLE_ALLOWED_IPS": "198.51.100.4/32",
            "DJANGO_ADMIN_ALLOWED_IPS": "", "JWT_REFRESH_COOKIE_SECURE": "True",
            "FRONTEND_BASE_URL": "https://shop.example.test", "ALLOW_LOCALHOST_FRONTEND": "False",
            "EMAIL_BACKEND": "django.core.mail.backends.locmem.EmailBackend",
            "BREVO_API_KEY": "", "SENTRY_DSN": "",
        })
        result = subprocess.run(
            [sys.executable, "-c",
             "from config import settings; assert settings.PACKAGE_SCAN_REQUIRED; "
             "assert not settings.PACKAGE_SCAN_HOST; print('startup-ok')"],
            env=env, capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("startup-ok", result.stdout)


@override_settings(PACKAGE_SCAN_HOST="clamav", PACKAGE_SCAN_PORT=3310)
class ScannerReadinessTests(SimpleTestCase):
    @override_settings(PACKAGE_SCAN_HOST="")
    def test_missing_scanner_fails_explicit_check(self):
        with self.assertRaisesMessage(CommandError, "not configured"):
            call_command("check_package_scanner")

    @patch("accounts.management.commands.check_package_scanner.socket.create_connection", side_effect=OSError())
    def test_unreachable_scanner_fails_check(self, connect):
        with self.assertRaisesMessage(CommandError, "unreachable"):
            call_command("check_package_scanner")

    @patch("accounts.management.commands.check_package_scanner.socket.create_connection")
    def test_invalid_reply_fails_check(self, connect):
        connect.return_value.__enter__.return_value.recv.return_value = b"ERROR\0"
        with self.assertRaisesMessage(CommandError, "invalid readiness response"):
            call_command("check_package_scanner")

    @patch("accounts.management.commands.check_package_scanner.socket.create_connection")
    def test_live_scanner_passes_check(self, connect):
        connection = connect.return_value.__enter__.return_value
        connection.recv.side_effect = [b"PO", b"NG\0"]
        out = StringIO()
        call_command("check_package_scanner", stdout=out)
        connection.sendall.assert_called_once_with(b"zPING\0")
        self.assertIn("scanner reachable", out.getvalue())
