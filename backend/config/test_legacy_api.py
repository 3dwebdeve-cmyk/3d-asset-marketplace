"""Legacy /api/ alias removal (Phase G)."""

from django.conf import settings
from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class LegacyApiRemovedTests(APITestCase):
    def test_unversioned_api_paths_are_gone(self) -> None:
        self.assertEqual(
            self.client.get("/api/healthz/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.post("/api/auth/login/", {}, format="json").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_canonical_v1_healthz_still_works(self) -> None:
        response = self.client.get(reverse("healthz"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class LegacyMiddlewareRemovedSettingsTests(SimpleTestCase):
    def test_legacy_middleware_not_installed(self) -> None:
        self.assertFalse(
            any("legacy_api" in entry for entry in settings.MIDDLEWARE),
        )
