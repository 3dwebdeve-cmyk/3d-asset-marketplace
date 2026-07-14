from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User


class AuthenticationAPITests(APITestCase):
    def setUp(self) -> None:
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            email="user@example.com",
            full_name="Existing User",
            password=self.password,
            role=self.customer_role,
            country="India",
        )

        self.register_url = reverse("accounts:register")
        self.login_url = reverse("accounts:login")
        self.logout_url = reverse("accounts:logout")
        self.me_url = reverse("accounts:me")
        self.refresh_url = reverse("accounts:token-refresh")

    def _login(self, email: str | None = None, password: str | None = None) -> dict:
        response = self.client.post(
            self.login_url,
            {
                "email": email or self.user.email,
                "password": password or self.password,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def _authenticate(self, access_token: str) -> None:
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    def test_register_creates_customer_account(self) -> None:
        payload = {
            "full_name": "New Customer",
            "email": "New.Customer@Example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "phone": "",
            "country": "India",
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "new.customer@example.com")
        self.assertEqual(response.data["role"], "Customer")
        self.assertNotIn("password", response.data)
        self.assertTrue(User.objects.filter(email="new.customer@example.com").exists())

    def test_register_rejects_duplicate_email(self) -> None:
        payload = {
            "full_name": "Duplicate User",
            "email": self.user.email,
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_rejects_password_mismatch(self) -> None:
        payload = {
            "full_name": "Mismatch User",
            "email": "mismatch@example.com",
            "password": "StrongPass123!",
            "password_confirm": "DifferentPass123!",
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password_confirm", response.data)
        self.assertFalse(User.objects.filter(email="mismatch@example.com").exists())

    def test_login_returns_tokens_and_user(self) -> None:
        data = self._login()

        self.assertIn("access", data)
        self.assertIn("refresh", data)
        self.assertEqual(data["user"]["email"], self.user.email)
        self.assertEqual(data["user"]["role"], "Customer")

    def test_login_is_case_insensitive_for_email(self) -> None:
        data = self._login(email="USER@EXAMPLE.COM")

        self.assertEqual(data["user"]["email"], self.user.email)

    def test_login_rejects_invalid_credentials(self) -> None:
        response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": "WrongPassword123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_authenticated_user(self) -> None:
        tokens = self._login()
        self._authenticate(tokens["access"])

        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], self.user.email)
        self.assertEqual(str(response.data["id"]), str(self.user.id))

    def test_me_requires_authentication(self) -> None:
        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_protected_endpoint_rejects_invalid_token(self) -> None:
        self._authenticate("this-is-not-a-valid-token")

        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_returns_new_access_token(self) -> None:
        tokens = self._login()

        response = self.client.post(
            self.refresh_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

        self._authenticate(response.data["access"])
        me_response = self.client.get(self.me_url)
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)

    def test_logout_blacklists_refresh_token(self) -> None:
        tokens = self._login()
        self._authenticate(tokens["access"])

        logout_response = self.client.post(
            self.logout_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )

        self.assertEqual(logout_response.status_code, status.HTTP_204_NO_CONTENT)

        self.client.credentials()
        refresh_response = self.client.post(
            self.refresh_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )

        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_requires_authentication(self) -> None:
        tokens = self._login()

        response = self.client.post(
            self.logout_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_rejects_invalid_refresh_token(self) -> None:
        tokens = self._login()
        self._authenticate(tokens["access"])

        response = self.client.post(
            self.logout_url,
            {"refresh": "not-a-valid-refresh-token"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
