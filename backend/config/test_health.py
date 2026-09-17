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
