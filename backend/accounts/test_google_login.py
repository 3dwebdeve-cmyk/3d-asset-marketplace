from unittest.mock import patch

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from accounts.services import AuthenticationService, RegistrationService


class GoogleLoginTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.url = reverse("accounts:google-login")
        self.customer_role = RegistrationService._get_customer_role()
        self.admin_role, _ = Role.objects.get_or_create(
            role_name="Administrator",
            defaults={"description": "Platform administrator"},
        )

    def _google_payload(self, **overrides) -> dict:
        payload = {
            "iss": "https://accounts.google.com",
            "sub": "google-sub-123",
            "email": "google.user@example.com",
            "email_verified": True,
            "name": "Google User",
            "picture": "https://example.com/avatar.jpg",
        }
        payload.update(overrides)
        return payload

    @patch("accounts.services.settings.GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_creates_new_google_customer(self, mock_verify) -> None:
        mock_verify.return_value = self._google_payload()

        response = self.client.post(self.url, {"id_token": "fake-token"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertIn("refresh_token", response.cookies)
        self.assertEqual(response.data["user"]["email"], "google.user@example.com")
        self.assertTrue(response.data["user"]["email_verified"])

        user = User.objects.get(email="google.user@example.com")
        self.assertEqual(user.google_id, "google-sub-123")
        self.assertFalse(user.has_usable_password())
        self.assertEqual(user.role.role_name, "Customer")

    @patch("accounts.services.settings.GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_links_existing_email_account(self, mock_verify) -> None:
        existing = User.objects.create_user(
            email="google.user@example.com",
            full_name="Existing User",
            password="Password123!",
            role=self.customer_role,
            email_verified=False,
        )
        mock_verify.return_value = self._google_payload()

        response = self.client.post(self.url, {"id_token": "fake-token"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        existing.refresh_from_db()
        self.assertEqual(existing.google_id, "google-sub-123")
        self.assertTrue(existing.email_verified)
        self.assertFalse(existing.has_usable_password())
        self.assertFalse(existing.check_password("Password123!"))
        self.assertEqual(existing.token_version, 1)

    @patch("accounts.services.settings.GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_rejects_administrator(self, mock_verify) -> None:
        admin = User.objects.create_user(
            email="admin@example.com",
            full_name="Admin User",
            password="Password123!",
            role=self.admin_role,
            email_verified=True,
        )
        admin.is_staff = True
        admin.save(update_fields=["is_staff"])
        mock_verify.return_value = self._google_payload(email="admin@example.com")

        response = self.client.post(self.url, {"id_token": "fake-token"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("admin sign-in", response.data["detail"].lower())

    @patch("accounts.services.settings.GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_rejects_unverified_google_email(self, mock_verify) -> None:
        mock_verify.return_value = self._google_payload(email_verified=False)

        response = self.client.post(self.url, {"id_token": "fake-token"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch("accounts.services.settings.GOOGLE_OAUTH_CLIENT_ID", "")
    def test_rejects_when_not_configured(self) -> None:
        response = self.client.post(self.url, {"id_token": "fake-token"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch("accounts.services.settings.GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    @patch("google.oauth2.id_token.verify_oauth2_token")
    def test_rejects_google_sub_conflict(self, mock_verify) -> None:
        User.objects.create_user(
            email="google.user@example.com",
            full_name="Existing User",
            password="Password123!",
            role=self.customer_role,
            email_verified=True,
        )
        linked = User.objects.get(email="google.user@example.com")
        linked.google_id = "other-google-sub"
        linked.save(update_fields=["google_id"])
        mock_verify.return_value = self._google_payload()

        response = self.client.post(self.url, {"id_token": "fake-token"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_tokens_still_work_for_google_user(self) -> None:
        user = User(
            email="token.user@example.com",
            full_name="Token User",
            role=self.customer_role,
            google_id="token-sub",
            email_verified=True,
        )
        user.set_unusable_password()
        user.save()

        tokens = AuthenticationService.build_tokens(user)
        self.assertTrue(tokens["access"])
        self.assertTrue(tokens["refresh"])
