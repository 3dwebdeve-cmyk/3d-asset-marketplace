"""The local E2E stack must never reach the real R2 buckets or Sentry.

Blanking a setting does not turn a service off on Windows: an empty process variable is
deleted, so the real value in backend/.env wins. These tests load the real settings in a
fresh interpreter (the test runner forces R2 off, so only a subprocess is honest) and check
the explicit off switches and the check_safe_settings command.
"""

from __future__ import annotations

import os
import subprocess
import sys

from django.test import SimpleTestCase

from config.settings_guard_testing import BACKEND_DIR, SAFE_BASE_ENV

R2_ENV = {
    "R2_ACCOUNT_ID": "acct",
    "R2_ACCESS_KEY_ID": "key",
    "R2_SECRET_ACCESS_KEY": "secret",
    "R2_ENDPOINT_URL": "https://acct.r2.cloudflarestorage.com",
    "R2_PUBLIC_BUCKET": "pub-bucket",
    "R2_PRIVATE_BUCKET": "priv-bucket",
    "R2_PUBLIC_BASE_URL": "https://pub.example.com",
}


def _run(args: list[str], **overrides: str) -> subprocess.CompletedProcess:
    env = {**os.environ, **SAFE_BASE_ENV, **R2_ENV, **overrides}
    return subprocess.run(
        [sys.executable, *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )


def _setting(name: str, **overrides: str) -> str:
    code = f"import config.settings as s; print(repr(s.{name}))"
    result = _run(["-c", code], **overrides)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


class ForceOffSwitchTests(SimpleTestCase):
    def test_r2_is_on_when_fully_configured(self):
        self.assertEqual(_setting("R2_ENABLED"), "True")

    def test_force_off_turns_r2_off_even_with_every_value_set(self):
        self.assertEqual(_setting("R2_ENABLED", R2_FORCE_OFF="True"), "False")

    def test_sentry_dsn_is_ignored_when_forced_off(self):
        dsn = "https://abc@o1.ingest.sentry.io/1"
        self.assertEqual(_setting("SENTRY_DSN", SENTRY_DSN=dsn, SENTRY_FORCE_OFF="True"), "''")


class CheckSafeSettingsTests(SimpleTestCase):
    def _check(self, **overrides: str) -> subprocess.CompletedProcess:
        return _run(["manage.py", "check_safe_settings"], **overrides)

    def test_fails_when_r2_would_be_used(self):
        result = self._check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("R2", result.stderr)

    def test_never_prints_secret_values(self):
        result = self._check()
        self.assertNotIn("secret", result.stdout + result.stderr)
        self.assertNotIn("pub-bucket", result.stdout + result.stderr)

    def test_fails_when_sentry_would_be_used(self):
        result = self._check(
            R2_FORCE_OFF="True", SENTRY_DSN="https://abc@o1.ingest.sentry.io/1"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Sentry", result.stderr)

    def test_passes_with_explicit_off_switches(self):
        result = self._check(
            R2_FORCE_OFF="True",
            SENTRY_DSN="https://abc@o1.ingest.sentry.io/1",
            SENTRY_FORCE_OFF="True",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
