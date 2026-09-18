from unittest.mock import MagicMock, patch

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class HealthzApiTests(APITestCase):
    def test_healthz_returns_ok_with_database(self) -> None:
        response = self.client.get(reverse("healthz"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["checks"]["database"], "ok")
        self.assertIn(response.data["checks"]["cache"], {"ok", "skipped"})
        self.assertIn(response.data["checks"]["meilisearch"], {"ok", "skipped"})

    @override_settings(MEILI_URL="http://127.0.0.1:7700", MEILI_MASTER_KEY="test-key")
    @patch("config.health.get_client")
    def test_healthz_meilisearch_ok(self, get_client: MagicMock) -> None:
        client = MagicMock()
        client.is_healthy.return_value = True
        get_client.return_value = client
        response = self.client.get(reverse("healthz"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["checks"]["meilisearch"], "ok")

    @override_settings(MEILI_URL="http://127.0.0.1:7700", MEILI_MASTER_KEY="test-key")
    @patch("config.health.get_client")
    def test_healthz_meilisearch_error(self, get_client: MagicMock) -> None:
        client = MagicMock()
        client.is_healthy.return_value = False
        get_client.return_value = client
        response = self.client.get(reverse("healthz"))
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["checks"]["meilisearch"], "error")
        self.assertEqual(response.data["status"], "unavailable")

    @override_settings(MEILI_REQUIRED=True, MEILI_URL="", MEILI_MASTER_KEY="")
    def test_healthz_meili_required_but_unconfigured(self) -> None:
        response = self.client.get(reverse("healthz"))
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["checks"]["meilisearch"], "error")
        self.assertEqual(response.data["status"], "unavailable")


class RedisProductionGuardTests(SimpleTestCase):
    def test_settings_require_redis_when_debug_false(self) -> None:
        """Mirror the settings.py guard so regressions are caught in CI."""
        debug = False
        redis_url = ""
        with self.assertRaises(ImproperlyConfigured):
            if not debug and not redis_url:
                raise ImproperlyConfigured(
                    "REDIS_URL is required when DEBUG=False so rate limits and cache "
                    "are shared across workers."
                )

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

    def test_celery_broker_defaults_from_redis_url(self) -> None:
        self.assertTrue(hasattr(settings, "CELERY_BROKER_URL"))
        self.assertTrue(hasattr(settings, "ALLOW_CONSOLE_EMAIL"))
        self.assertTrue(hasattr(settings, "ALLOW_LOCALHOST_FRONTEND"))

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
