from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User


class AdministratorAccessAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"
        self.admin_user = User.objects.create_user(
            email="admin@example.com",
            full_name="Platform Admin",
            password=self.password,
            role=self.admin_role,
            country="India",
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])

        self.customer_user = User.objects.create_user(
            email="customer@example.com",
            full_name="Marketplace Customer",
            password=self.password,
            role=self.customer_role,
            country="India",
            email_verified=True,
        )

        self.login_url = reverse("accounts:login")
        self.admin_login_url = reverse("accounts:admin-login")
        self.admin_me_url = reverse("accounts:admin-me")

    def _customer_login(self, email: str) -> dict:
        response = self.client.post(
            self.login_url,
            {"email": email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def _admin_login(self, email: str) -> dict:
        response = self.client.post(
            self.admin_login_url,
            {"email": email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def test_customer_login_rejects_administrator(self) -> None:
        response = self.client.post(
            self.login_url,
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        wrong_password = self.client.post(
            self.login_url,
            {"email": self.admin_user.email, "password": "Wrong-password-1!"},
            format="json",
        )
        # A correct admin password must be indistinguishable from a wrong one.
        self.assertEqual(response.data, wrong_password.data)
        self.assertEqual(response.data.get("detail"), "Invalid email or password.")
        self.assertNotIn("access", response.data)

    def test_customer_login_allows_customer(self) -> None:
        data = self._customer_login(self.customer_user.email)

        self.assertEqual(data["user"]["role"], "Customer")
        self.assertIn("access", data)

    def test_admin_login_allows_administrator(self) -> None:
        data = self._admin_login(self.admin_user.email)

        self.assertEqual(data["user"]["role"], "Administrator")
        self.assertIn("access", data)
        self.assertNotIn("refresh", data)

    def test_admin_login_rejects_customer(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data.get("detail"), "Administrator access required.")
        self.assertNotIn("access", response.data)

    def test_admin_login_rejects_invalid_credentials(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin_user.email, "password": "WrongPassword1!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data.get("detail"), "Invalid email or password.")

    def test_admin_me_allows_administrator(self) -> None:
        tokens = self._admin_login(self.admin_user.email)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.get(self.admin_me_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], self.admin_user.email)
        self.assertEqual(response.data["role"], "Administrator")

    def test_admin_me_rejects_customer(self) -> None:
        tokens = self._customer_login(self.customer_user.email)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.get(self.admin_me_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_me_requires_authentication(self) -> None:
        response = self.client.get(self.admin_me_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inactive_administrator_cannot_access_admin_me(self) -> None:
        tokens = self._admin_login(self.admin_user.email)
        self.admin_user.is_active = False
        self.admin_user.save(update_fields=["is_active", "updated_at"])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

        response = self.client.get(self.admin_me_url)

        self.assertIn(
            response.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
