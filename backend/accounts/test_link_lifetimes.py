"""How long emailed links work: password reset 15 minutes, email verification 24 hours."""

from datetime import datetime, timedelta
from unittest import mock

from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import Role, User
from accounts.services import (
    email_verification_token_generator,
    password_reset_token_generator,
)


class LinkLifetimeTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.user = User.objects.create_user(
            email="link-life@example.com",
            full_name="Link Life",
            password="StrongPass123!",
            role=Role.objects.get(role_name="Customer"),
            country="India",
            email_verified=False,
        )
        self.issued_at = datetime(2026, 11, 24, 10, 0, 0)

    def _token(self, generator) -> str:
        with mock.patch.object(generator, "_now", return_value=self.issued_at):
            return generator.make_token(self.user)

    def _valid_after(self, generator, token: str, elapsed: timedelta) -> bool:
        with mock.patch.object(generator, "_now", return_value=self.issued_at + elapsed):
            return generator.check_token(self.user, token)

    def test_password_reset_link_works_for_15_minutes(self) -> None:
        token = self._token(password_reset_token_generator)

        self.assertTrue(self._valid_after(password_reset_token_generator, token, timedelta(minutes=14)))
        self.assertTrue(self._valid_after(password_reset_token_generator, token, timedelta(minutes=15)))
        self.assertFalse(
            self._valid_after(password_reset_token_generator, token, timedelta(minutes=15, seconds=1))
        )
        self.assertFalse(self._valid_after(password_reset_token_generator, token, timedelta(days=1)))

    def test_password_reset_link_stops_working_once_the_password_changes(self) -> None:
        token = password_reset_token_generator.make_token(self.user)
        self.user.set_password("AnotherPass123!")
        self.user.save()

        self.assertFalse(password_reset_token_generator.check_token(self.user, token))

    def test_email_verification_link_works_for_24_hours(self) -> None:
        token = self._token(email_verification_token_generator)

        self.assertTrue(
            self._valid_after(email_verification_token_generator, token, timedelta(minutes=16))
        )
        self.assertTrue(self._valid_after(email_verification_token_generator, token, timedelta(hours=24)))
        self.assertFalse(
            self._valid_after(
                email_verification_token_generator, token, timedelta(hours=24, seconds=1)
            )
        )

    def test_tokens_of_one_kind_do_not_work_as_the_other(self) -> None:
        reset = password_reset_token_generator.make_token(self.user)
        verify = email_verification_token_generator.make_token(self.user)

        self.assertFalse(email_verification_token_generator.check_token(self.user, reset))
        self.assertFalse(password_reset_token_generator.check_token(self.user, verify))

    def test_tampered_or_malformed_verification_tokens_fail(self) -> None:
        token = email_verification_token_generator.make_token(self.user)

        for bad in ("", "no-dash-here-x", "zzz", token[:-1] + ("a" if token[-1] != "a" else "b")):
            with self.subTest(token=bad):
                self.assertFalse(email_verification_token_generator.check_token(self.user, bad))
        self.assertFalse(email_verification_token_generator.check_token(None, token))

    def test_reset_email_says_the_link_expires_in_15_minutes(self) -> None:
        self.user.email_verified = True
        self.user.save()

        self.client.post(reverse("accounts:password-reset"), {"email": self.user.email}, format="json")

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("expires in 15 minutes", mail.outbox[0].body)
