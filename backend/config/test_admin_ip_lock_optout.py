"""ADMIN_CONSOLE_IP_LOCK_OFF: an explicit, safe way to run without the admin IP allowlist."""

import os
import subprocess
import sys

from django.test import SimpleTestCase, override_settings

from config.deploy_checks import collect_deploy_config_report

BASE_ENV = {
    "DEBUG": "False", "DEPLOYMENT_PROFILE": "production",
    "SECRET_KEY": "startup-regression-test-key-not-used-in-production-123456789",
    "E2E_STRIPE_SIMULATE": "False", "PACKAGE_SCAN_HOST": "",
    "DJANGO_ADMIN_ENABLED": "False", "DJANGO_ADMIN_ALLOWED_IPS": "",
    "JWT_REFRESH_COOKIE_SECURE": "True", "FRONTEND_BASE_URL": "https://shop.example.test",
    "ALLOW_LOCALHOST_FRONTEND": "False",
    "EMAIL_BACKEND": "django.core.mail.backends.locmem.EmailBackend",
    "BREVO_API_KEY": "", "SENTRY_DSN": "",
}


def _load_settings(**overrides):
    env = os.environ.copy()
    env.update(BASE_ENV)
    env.update(overrides)
    return subprocess.run(
        [sys.executable, "-c",
         "from config import settings as s; print('ips=%r off=%r' % (s.ADMIN_CONSOLE_ALLOWED_IPS, s.ADMIN_CONSOLE_IP_LOCK_OFF))"],
        env=env, capture_output=True, text=True, timeout=60,
    )


class ProductionStartupTests(SimpleTestCase):
    def test_production_still_refuses_an_empty_allowlist_by_default(self):
        result = _load_settings(ADMIN_CONSOLE_ALLOWED_IPS="")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ADMIN_CONSOLE_ALLOWED_IPS must restrict administrator access", result.stderr)

    def test_opting_out_lets_production_start_without_an_allowlist(self):
        result = _load_settings(ADMIN_CONSOLE_ALLOWED_IPS="", ADMIN_CONSOLE_IP_LOCK_OFF="true")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ips=[] off=True", result.stdout)

    def test_opting_out_ignores_an_old_allowlist_instead_of_failing(self):
        result = _load_settings(ADMIN_CONSOLE_ALLOWED_IPS="198.51.100.4/32", ADMIN_CONSOLE_IP_LOCK_OFF="true")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ips=[] off=True", result.stdout)

    def test_the_lock_stays_on_when_not_opted_out(self):
        result = _load_settings(ADMIN_CONSOLE_ALLOWED_IPS="198.51.100.4/32")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ips=['198.51.100.4/32'] off=False", result.stdout)

    def test_opting_out_never_removes_the_authenticator_requirement(self):
        result = _load_settings(
            ADMIN_CONSOLE_ALLOWED_IPS="", ADMIN_CONSOLE_IP_LOCK_OFF="true", ADMIN_MFA_REQUIRED="False",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ADMIN_MFA_REQUIRED", result.stderr)


@override_settings(DEBUG=False, ADMIN_CONSOLE_ALLOWED_IPS=[])
class DeployCheckTests(SimpleTestCase):
    def _warnings(self):
        return " ".join(collect_deploy_config_report().warnings)

    @override_settings(ADMIN_CONSOLE_IP_LOCK_OFF=False)
    def test_an_empty_allowlist_is_still_a_warning_by_default(self):
        self.assertIn("ADMIN_CONSOLE_ALLOWED_IPS", self._warnings())

    @override_settings(ADMIN_CONSOLE_IP_LOCK_OFF=True)
    def test_a_deliberate_opt_out_does_not_fail_the_cutover_check(self):
        self.assertNotIn("ADMIN_CONSOLE_ALLOWED_IPS", self._warnings())
