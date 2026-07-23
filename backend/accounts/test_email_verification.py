from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from accounts.services import email_verification_token_generator


class EmailVerificationAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            email="verify-user@example.com",
            full_name="Verify User",
            password=self.password,
            role=self.customer_role,
            country="India",
        )
        self.register_url = reverse("accounts:register")
        self.login_url = reverse("accounts:login")
        self.resend_url = reverse("accounts:email-verification-resend")
        self.confirm_url = reverse("accounts:email-verification-confirm")

    def test_register_sends_verification_email(self) -> None:
        response = self.client.post(
            self.register_url,
            {
                "full_name": "New Customer",
                "email": "new.verify@example.com",
                "password": "StrongPass123!",
                "password_confirm": "StrongPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data["email_verified"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/verify-email/", mail.outbox[0].body)

    def test_login_rejects_unverified_customer(self) -> None:
        response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get("code"), "email_not_verified")

    def test_confirm_verification_allows_login(self) -> None:
        uid = urlsafe_base64_encode(force_bytes(str(self.user.pk)))
        token = email_verification_token_generator.make_token(self.user)

        confirm_response = self.client.post(
            self.confirm_url,
            {"uid": uid, "token": token},
            format="json",
        )
        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)

        login_response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        self.assertTrue(login_response.data["user"]["email_verified"])

    def test_confirm_verification_is_idempotent_when_already_verified(self) -> None:
        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])
        uid = urlsafe_base64_encode(force_bytes(str(self.user.pk)))
        token = email_verification_token_generator.make_token(self.user)

        response = self.client.post(
            self.confirm_url,
            {"uid": uid, "token": token},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_confirm_verification_rejects_invalid_token(self) -> None:
        uid = urlsafe_base64_encode(force_bytes(str(self.user.pk)))

        response = self.client.post(
            self.confirm_url,
            {"uid": uid, "token": "invalid-token"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertFalse(self.user.email_verified)

    def test_confirm_verification_rejects_truncated_uid_without_500(self) -> None:
        """Truncated base64 can decode to an invalid UUID; must not crash."""
        full_uid = urlsafe_base64_encode(force_bytes(str(self.user.pk)))
        truncated_uid = full_uid[:-4]

        response = self.client.post(
            self.confirm_url,
            {"uid": truncated_uid, "token": "any-token"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertFalse(self.user.email_verified)

    def test_resend_sends_email_for_unverified_user(self) -> None:
        response = self.client.post(
            self.resend_url,
            {"email": self.user.email},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/verify-email/", mail.outbox[0].body)

    def test_resend_does_not_reveal_unknown_email(self) -> None:
        response = self.client.post(
            self.resend_url,
            {"email": "missing@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

    def test_resend_skips_already_verified_user(self) -> None:
        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])

        response = self.client.post(
            self.resend_url,
            {"email": self.user.email},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)
