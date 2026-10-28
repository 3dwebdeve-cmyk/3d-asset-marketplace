"""Helper for tests that import the real settings module with chosen env vars.

Settings guards run at import time, so the only honest test is to import
``config.settings`` in a fresh interpreter and see whether it refuses to load.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

# A configuration that loads cleanly with DEBUG=False; tests override one guard at a time.
SAFE_BASE_ENV = {
    "DEBUG": "False",
    "DEPLOYMENT_PROFILE": "development",
    "SECRET_KEY": "settings-guard-test-key-that-is-long-enough-0123456789",
    "FRONTEND_BASE_URL": "https://shop.example.com",
    "ALLOW_LOCALHOST_FRONTEND": "False",
    "EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend",
    "ALLOW_CONSOLE_EMAIL": "False",
    "BREVO_API_KEY": "",
    "SENTRY_DSN": "",
    "E2E_STRIPE_SIMULATE": "False",
}


def import_settings(**overrides: str) -> subprocess.CompletedProcess:
    env = {**os.environ, **SAFE_BASE_ENV, **overrides}
    return subprocess.run(
        [sys.executable, "-c", "import config.settings"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
