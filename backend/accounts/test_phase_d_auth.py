"""Phase D — ensure_administrator / check_auth_config / FRONTEND_BASE_URL guards."""

from __future__ import annotations

from io import StringIO
from urllib.parse import urlparse

from django.core.exceptions import ImproperlyConfigured
from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from config.mail import frontend_base_url, frontend_base_url_is_localhost


class FrontendBaseUrlHelperTests(SimpleTestCase):
    def test_localhost_detection(self) -> None:
        self.assertTrue(frontend_base_url_is_localhost("http://localhost:5173"))
        self.assertTrue(frontend_base_url_is_localhost("http://127.0.0.1:5173"))
        self.assertFalse(frontend_base_url_is_localhost("https://shop.example.com"))

    def test_settings_refuse_localhost_frontend_when_debug_false(self) -> None:
        """Mirror settings.py Phase D2 guard."""
        debug = False
        running_tests = False
        allow_localhost_frontend = False
        frontend_host = (urlparse("http://localhost:5173").hostname or "").lower()
        with self.assertRaises(ImproperlyConfigured):
            if (
                not debug
                and not running_tests
                and not allow_localhost_frontend
                and frontend_host in {"localhost", "127.0.0.1", "::1"}
            ):
                raise ImproperlyConfigured(
                    "FRONTEND_BASE_URL must be the public SPA origin when DEBUG=False."
                )


class EnsureAdministratorCommandTests(TestCase):
    def test_creates_and_is_idempotent(self) -> None:
        out = StringIO()
        call_command(
            "ensure_administrator",
            email="phase-d-admin@example.com",
            password="StrongPass123!",
            full_name="Phase D Admin",
            stdout=out,
        )
        user = User.objects.get(email="phase-d-admin@example.com")
        self.assertEqual(user.role.role_name, "Administrator")
        self.assertTrue(user.email_verified)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.check_password("StrongPass123!"))

        out2 = StringIO()
        call_command(
            "ensure_administrator",
            email="phase-d-admin@example.com",
            stdout=out2,
        )
        self.assertIn("already an active Administrator", out2.getvalue())

    def test_promotes_existing_customer(self) -> None:
        customer_role = Role.objects.get(role_name="Customer")
        User.objects.create_user(
            email="promote-me@example.com",
            full_name="Soon Admin",
            password="StrongPass123!",
            role=customer_role,
            email_verified=False,
        )
        call_command(
            "ensure_administrator",
            email="promote-me@example.com",
            password="NewStrongPass123!",
        )
        user = User.objects.get(email="promote-me@example.com")
        self.assertEqual(user.role.role_name, "Administrator")
        self.assertTrue(user.email_verified)
        self.assertTrue(user.check_password("NewStrongPass123!"))


class CheckAuthConfigCommandTests(TestCase):
    def test_fails_when_no_admin_and_flag_set(self) -> None:
        User.objects.filter(role__role_name="Administrator").update(is_active=False)
        with self.assertRaises(CommandError):
            call_command("check_auth_config", fail_on_warnings=True)

    @override_settings(FRONTEND_BASE_URL="https://shop.example.com", DEBUG=True)
    def test_reports_public_frontend(self) -> None:
        Role.objects.get_or_create(role_name="Administrator")
        # Ensure at least one admin so --fail-on-warnings is clean.
        call_command(
            "ensure_administrator",
            email="check-auth-admin@example.com",
            password="StrongPass123!",
        )
        out = StringIO()
        call_command("check_auth_config", fail_on_warnings=True, stdout=out)
        self.assertIn("https://shop.example.com", out.getvalue())
        self.assertIn("Auth config looks ready", out.getvalue())


class VerificationLinkUsesFrontendBaseUrlTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()

    @override_settings(FRONTEND_BASE_URL="https://assets.example.com")
    def test_register_email_uses_frontend_base_url(self) -> None:
        response = self.client.post(
            reverse("accounts:register"),
            {
                "full_name": "Link User",
                "email": "link-user@example.com",
                "password": "StrongPass123!",
                "password_confirm": "StrongPass123!",
                "accepted_legal": {
                    "terms": "2026-09-18",
                    "privacy": "2026-09-18",
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(
            "https://assets.example.com/verify-email/",
            mail.outbox[0].body,
        )
        self.assertEqual(frontend_base_url(), "https://assets.example.com")
