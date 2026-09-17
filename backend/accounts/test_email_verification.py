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
    """Register sends verification mail; login is gated until confirmed."""

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

    def test_register_creates_unverified_user_and_sends_mail(self) -> None:
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
        self.assertIn("new.verify@example.com", mail.outbox[0].to)
        self.assertIn("/verify-email/", mail.outbox[0].body)

    def test_login_rejects_unverified_customer(self) -> None:
        self.assertFalse(self.user.email_verified)
        response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["code"], "email_not_verified")

    def test_confirm_verification_allows_login(self) -> None:
        uid = urlsafe_base64_encode(force_bytes(str(self.user.pk)))
        token = email_verification_token_generator.make_token(self.user)

        confirm_response = self.client.post(
            self.confirm_url,
            {"uid": uid, "token": token},
            format="json",
        )
        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.email_verified)

        login_response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        self.assertIn("access", login_response.data)

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

    def test_resend_sends_mail_only_for_unverified_accounts(self) -> None:
        response = self.client.post(
            self.resend_url,
            {"email": self.user.email},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/verify-email/", mail.outbox[0].body)

        unknown = self.client.post(
            self.resend_url,
            {"email": "nobody@example.com"},
            format="json",
        )
        self.assertEqual(unknown.status_code, status.HTTP_200_OK)
        self.assertEqual(unknown.data["detail"], response.data["detail"])
        self.assertEqual(len(mail.outbox), 1)

        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])
        mail.outbox.clear()
        verified = self.client.post(
            self.resend_url,
            {"email": self.user.email},
            format="json",
        )
        self.assertEqual(verified.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)


class EmailVerificationDevDxTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            email="dx-user@example.com",
            full_name="DX User",
            password=self.password,
            role=self.customer_role,
        )
        self.register_url = reverse("accounts:register")
        self.login_url = reverse("accounts:login")

    def test_register_logs_verification_link_when_debug(self) -> None:
        from django.test import override_settings

        with override_settings(DEBUG=True):
            with self.assertLogs("accounts.dev_mail", level="WARNING") as logs:
                response = self.client.post(
                    self.register_url,
                    {
                        "full_name": "Console Customer",
                        "email": "console.verify@example.com",
                        "password": "StrongPass123!",
                        "password_confirm": "StrongPass123!",
                    },
                    format="json",
                )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data["email_verified"])
        self.assertTrue(any("EMAIL VERIFICATION LINK" in line for line in logs.output))

    def test_verify_email_command_allows_login(self) -> None:
        from io import StringIO

        from django.core.management import call_command

        self.assertFalse(self.user.email_verified)
        out = StringIO()
        call_command("verify_email", self.user.email, stdout=out)
        self.user.refresh_from_db()
        self.assertTrue(self.user.email_verified)
        self.assertIn("email_verified", out.getvalue())

        login = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)

    def test_verify_email_command_rejects_unknown_user(self) -> None:
        from django.core.management import call_command
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            call_command("verify_email", "missing@example.com")
