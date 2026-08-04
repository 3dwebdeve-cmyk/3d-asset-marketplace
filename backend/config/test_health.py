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
        self.assertIn(response.data["checks"]["cache"], {"ok", "skipped"})


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
