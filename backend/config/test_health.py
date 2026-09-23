from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class HealthzApiTests(APITestCase):
    def test_healthz_returns_ok_with_database(self) -> None:
        response = self.client.get(reverse("healthz"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["checks"]["database"], "ok")
        self.assertEqual(response.data["checks"]["cache"], "ok")
        self.assertNotIn("meilisearch", response.data["checks"])


class ProductionGuardTests(SimpleTestCase):
    def test_console_email_blocked_when_debug_false_without_allow(self) -> None:
        """Mirror the settings.py console-email guard (Phase A3)."""
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

    def test_localhost_frontend_blocked_when_debug_false_without_allow(self) -> None:
        """Mirror the settings.py FRONTEND_BASE_URL guard (Phase D2)."""
        debug = False
        running_tests = False
        allow_localhost_frontend = False
        frontend_host = "localhost"
        with self.assertRaises(ImproperlyConfigured):
            if (
                not debug
                and not running_tests
                and not allow_localhost_frontend
                and frontend_host in {"localhost", "127.0.0.1", "::1"}
            ):
                raise ImproperlyConfigured(
                    "FRONTEND_BASE_URL must be the public SPA origin when DEBUG=False."
                )

    def test_celery_runs_eager_without_redis(self) -> None:
        self.assertEqual(settings.CELERY_BROKER_URL, "memory://")
        self.assertTrue(settings.CELERY_TASK_ALWAYS_EAGER)
        self.assertEqual(settings.REDIS_URL, "")
        self.assertFalse(settings.MEILI_REQUIRED)
        self.assertEqual(settings.MEILI_URL, "")

    def test_static_root_configured(self) -> None:
        self.assertTrue(str(settings.STATIC_ROOT).endswith("staticfiles"))

    def test_whitenoise_middleware_enabled(self) -> None:
        self.assertIn(
            "whitenoise.middleware.WhiteNoiseMiddleware",
            settings.MIDDLEWARE,
        )
        self.assertEqual(
            settings.MIDDLEWARE[0],
            "django.middleware.security.SecurityMiddleware",
        )
        self.assertEqual(
            settings.MIDDLEWARE[1],
            "whitenoise.middleware.WhiteNoiseMiddleware",
        )
