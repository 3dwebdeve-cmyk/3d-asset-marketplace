"""API versioning: canonical /api/v1/ and legacy /api/ aliases."""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class ApiVersioningTests(APITestCase):
    def test_reverse_healthz_uses_v1_prefix(self) -> None:
        self.assertEqual(reverse("healthz"), "/api/v1/healthz/")

    def test_v1_healthz_ok(self) -> None:
        response = self.client.get("/api/v1/healthz/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")

    def test_legacy_healthz_alias_ok(self) -> None:
        response = self.client.get("/api/healthz/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")

    def test_reverse_auth_login_uses_v1_prefix(self) -> None:
        self.assertEqual(reverse("accounts:login"), "/api/v1/auth/login/")

    def test_legacy_auth_login_alias_resolves(self) -> None:
        # Empty body → 400 validation, proving the legacy path hits the view.
        response = self.client.post(
            "/api/auth/login/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_v1_auth_login_resolves(self) -> None:
        response = self.client.post(
            "/api/v1/auth/login/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
