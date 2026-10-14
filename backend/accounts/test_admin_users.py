from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User


class AdminUserCRUDAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"

        self.admin_user = User.objects.create_user(
            email="admin-crud@example.com",
            full_name="Admin User",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])

        self.second_admin = User.objects.create_user(
            email="admin-two@example.com",
            full_name="Second Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.second_admin.is_staff = True
        self.second_admin.save(update_fields=["is_staff", "updated_at"])

        self.customer_user = User.objects.create_user(
            email="customer-crud@example.com",
            full_name="Customer User",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )

        self.list_url = reverse("accounts:admin-users")
        self.admin_login_url = reverse("accounts:admin-login")

    def _authenticate_as(self, email: str) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _detail_url(self, user_id) -> str:
        return reverse("accounts:admin-user-detail", kwargs={"user_id": user_id})

    def test_list_users_requires_administrator(self) -> None:
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        login = self.client.post(
            reverse("accounts:login"),
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_and_filter_users(self) -> None:
        self._authenticate_as(self.admin_user.email)

        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertGreaterEqual(response.data["count"], 3)

        filtered = self.client.get(self.list_url, {"role": "Customer"})
        self.assertEqual(filtered.status_code, status.HTTP_200_OK)
        self.assertTrue(
            all(item["role"] == "Customer" for item in filtered.data["results"])
        )

    def test_create_user(self) -> None:
        self._authenticate_as(self.admin_user.email)

        response = self.client.post(
            self.list_url,
            {
                "full_name": "New Customer",
                "email": "new.customer@example.com",
                "password": "StrongPass123!",
                "password_confirm": "StrongPass123!",
                "role": "Customer",
                "country": "India",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "new.customer@example.com")
        self.assertEqual(response.data["role"], "Customer")
        self.assertTrue(response.data["email_verified"])
        self.assertTrue(response.data["is_active"])
        self.assertEqual(len(mail.outbox), 0)

    def test_update_and_deactivate_user(self) -> None:
        self._authenticate_as(self.admin_user.email)

        patch = self.client.patch(
            self._detail_url(self.customer_user.id),
            {"full_name": "Updated Customer", "is_active": False},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        self.assertEqual(patch.data["full_name"], "Updated Customer")
        self.assertFalse(patch.data["is_active"])

        self.customer_user.refresh_from_db()
        self.assertFalse(self.customer_user.is_active)

    def test_demoting_an_admin_removes_superuser_rights(self) -> None:
        self.second_admin.is_superuser = True
        self.second_admin.save(update_fields=["is_superuser", "updated_at"])
        self._authenticate_as(self.admin_user.email)

        response = self.client.patch(
            self._detail_url(self.second_admin.id),
            {"role": "Customer"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.second_admin.refresh_from_db()
        self.assertEqual(self.second_admin.role.role_name, "Customer")
        self.assertFalse(self.second_admin.is_staff)
        self.assertFalse(self.second_admin.is_superuser)

    def test_admin_can_mark_email_verified(self) -> None:
        self.customer_user.email_verified = False
        self.customer_user.save(update_fields=["email_verified", "updated_at"])
        self._authenticate_as(self.admin_user.email)

        patch = self.client.patch(
            self._detail_url(self.customer_user.id),
            {"email_verified": True},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        self.assertTrue(patch.data["email_verified"])
        self.customer_user.refresh_from_db()
        self.assertTrue(self.customer_user.email_verified)

    def test_cannot_deactivate_self(self) -> None:
        self._authenticate_as(self.admin_user.email)

        response = self.client.patch(
            self._detail_url(self.admin_user.id),
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_remove_last_administrator(self) -> None:
        self.second_admin.is_active = False
        self.second_admin.save(update_fields=["is_active", "updated_at"])
        self._authenticate_as(self.admin_user.email)

        response = self.client.patch(
            self._detail_url(self.admin_user.id),
            {"role": "Customer"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_soft_deactivates_user(self) -> None:
        self._authenticate_as(self.admin_user.email)

        response = self.client.delete(self._detail_url(self.customer_user.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["is_active"])
        self.assertTrue(User.objects.filter(pk=self.customer_user.pk).exists())
