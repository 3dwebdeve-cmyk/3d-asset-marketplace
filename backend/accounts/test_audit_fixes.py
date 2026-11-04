"""Regression tests for the 2026-11 security audit fixes in accounts."""

from __future__ import annotations

from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from accounts.services import AuthenticationService

PASSWORD = "Audit-Strong-Pass-2026!"
NO_THROTTLE = patch(
    "rest_framework.throttling.SimpleRateThrottle.allow_request", return_value=True
)


class ChangePasswordLockoutTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.user = User.objects.create_user(
            email="lockout-user@example.com",
            full_name="Lockout User",
            password=PASSWORD,
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        access = AuthenticationService.build_tokens(self.user)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def _change(self, current: str):
        return self.client.post(
            reverse("accounts:change-password"),
            {
                "current_password": current,
                "new_password": "Another-Strong-Pass-2027!",
                "new_password_confirm": "Another-Strong-Pass-2027!",
            },
            format="json",
        )

    def test_wrong_current_password_locks_after_repeated_guesses(self) -> None:
        with NO_THROTTLE:
            statuses = [self._change("wrong-password-1").status_code for _ in range(11)]
            self.assertTrue(all(code == status.HTTP_400_BAD_REQUEST for code in statuses[:10]))
            self.assertEqual(statuses[-1], status.HTTP_429_TOO_MANY_REQUESTS)
            # Even the right password is refused while locked.
            self.assertEqual(self._change(PASSWORD).status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class RecoveryCodesLockoutTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin = User.objects.create_user(
            email="recovery-lock@example.com",
            full_name="Recovery Lock",
            password=PASSWORD,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        access = AuthenticationService.build_tokens(self.admin, mfa=True)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def test_wrong_codes_lock_after_repeated_guesses(self) -> None:
        url = reverse("accounts:admin-mfa-recovery-codes")
        with NO_THROTTLE:
            statuses = [
                self.client.post(url, {"code": "000000"}, format="json").status_code
                for _ in range(11)
            ]
        self.assertTrue(all(code == status.HTTP_400_BAD_REQUEST for code in statuses[:10]))
        self.assertEqual(statuses[-1], status.HTTP_429_TOO_MANY_REQUESTS)


class RegistrationNoticeTests(APITestCase):
    def test_existing_email_gets_a_queued_notice_and_the_same_response(self) -> None:
        User.objects.create_user(
            email="already@example.com",
            full_name="Already Registered",
            password=PASSWORD,
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        payload = {
            "full_name": "Someone Else",
            "email": "already@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "accepted_legal": {"terms": "2026-09-18", "privacy": "2026-09-18"},
        }
        mail.outbox.clear()
        with patch("accounts.services.make_password") as hasher:
            response = self.client.post(reverse("accounts:register"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # The password is hashed on this branch too, so timing matches a new account.
        hasher.assert_called_once()
        self.assertEqual([m.subject for m in mail.outbox], ["Account registration attempt"])
        self.assertEqual(User.objects.filter(email="already@example.com").count(), 1)
