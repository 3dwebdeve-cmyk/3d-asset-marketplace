from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from accounts.services import password_reset_token_generator


class PasswordResetAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            email="reset-user@example.com",
            full_name="Reset User",
            password=self.password,
            role=self.customer_role,
            country="India",
        )
        self.request_url = reverse("accounts:password-reset")
        self.confirm_url = reverse("accounts:password-reset-confirm")
        self.login_url = reverse("accounts:login")

    def test_request_reset_sends_email_for_existing_user(self) -> None:
        response = self.client.post(
            self.request_url,
            {"email": self.user.email},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.user.email, mail.outbox[0].to)
        self.assertIn("/reset-password/", mail.outbox[0].body)

    def test_request_reset_does_not_reveal_unknown_email(self) -> None:
        response = self.client.post(
            self.request_url,
            {"email": "missing@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

    def test_confirm_reset_updates_password(self) -> None:
        uid = urlsafe_base64_encode(force_bytes(str(self.user.pk)))
        token = password_reset_token_generator.make_token(self.user)
        new_password = "BrandNewPass123!"

        response = self.client.post(
            self.confirm_url,
            {
                "uid": uid,
                "token": token,
                "new_password": new_password,
                "new_password_confirm": new_password,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(new_password))

        login_response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": new_password},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

    def test_confirm_reset_rejects_invalid_token(self) -> None:
        uid = urlsafe_base64_encode(force_bytes(str(self.user.pk)))

        response = self.client.post(
            self.confirm_url,
            {
                "uid": uid,
                "token": "invalid-token",
                "new_password": "BrandNewPass123!",
                "new_password_confirm": "BrandNewPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.password))

    def test_confirm_reset_rejects_password_mismatch(self) -> None:
        uid = urlsafe_base64_encode(force_bytes(str(self.user.pk)))
        token = password_reset_token_generator.make_token(self.user)

        response = self.client.post(
            self.confirm_url,
            {
                "uid": uid,
                "token": token,
                "new_password": "BrandNewPass123!",
                "new_password_confirm": "DifferentPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password_confirm", response.data)
