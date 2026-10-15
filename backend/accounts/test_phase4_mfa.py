"""Phase 4 security: administrator 2FA, session limit, breached passwords, sign-in emails."""

from __future__ import annotations

import base64
import time
from io import StringIO
from unittest.mock import MagicMock, patch

import requests
from django.conf import settings
from django.core import mail
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts import mfa
from accounts.models import AdminRecoveryCode, KnownDevice, Role, User
from accounts.password_validation import BreachedPasswordValidator
from accounts.security_notices import DEVICE_COOKIE_NAME
from accounts.services import AuthenticationService
from config.settings_guard_testing import import_settings

PASSWORD = "Admin-Strong-Pass-2026!"
NOW = 1_800_000_000.0  # Fixed clock so codes are predictable.


def _code(secret_b32: str, at: float) -> str:
    padded = secret_b32 + "=" * (-len(secret_b32) % 8)
    return mfa.hotp(base64.b32decode(padded), mfa.current_counter(at))


class TotpStandardTests(SimpleTestCase):
    def test_rfc6238_sha1_vectors(self) -> None:
        secret = b"12345678901234567890"
        for at, expected in (
            (59, "94287082"),
            (1111111109, "07081804"),
            (1111111111, "14050471"),
            (1234567890, "89005924"),
            (2000000000, "69279037"),
        ):
            with self.subTest(at=at):
                self.assertEqual(mfa.hotp(secret, mfa.current_counter(at), digits=8), expected)

    def test_drift_window_and_spent_steps(self) -> None:
        secret = b"12345678901234567890"
        counter = mfa.current_counter(NOW)
        previous = mfa.hotp(secret, counter - 1)
        self.assertEqual(mfa.match_totp(secret, previous, after_counter=0, now=NOW), counter - 1)
        two_back = mfa.hotp(secret, counter - 2)
        self.assertIsNone(mfa.match_totp(secret, two_back, after_counter=0, now=NOW))
        current = mfa.hotp(secret, counter)
        self.assertIsNone(mfa.match_totp(secret, current, after_counter=counter, now=NOW))


@override_settings(ADMIN_MFA_REQUIRED=True)
class AdminMfaFlowTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin = User.objects.create_user(
            email="mfa-admin@example.com",
            full_name="MFA Admin",
            password=PASSWORD,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        self.clock = patch("accounts.mfa.time.time", return_value=NOW)
        self.clock.start()
        self.addCleanup(self.clock.stop)

    def _login(self) -> dict:
        # Each test signs in several times; reset the per-minute request throttle.
        cache.clear()
        response = self.client.post(
            reverse("accounts:admin-login"),
            {"email": self.admin.email, "password": PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def _enroll(self) -> tuple[str, list[str]]:
        token = self._login()["mfa_token"]
        setup = self.client.post(reverse("accounts:admin-mfa-setup"), {"mfa_token": token}, format="json")
        self.assertEqual(setup.status_code, status.HTTP_200_OK, setup.data)
        secret = setup.data["secret"]
        confirm = self.client.post(
            reverse("accounts:admin-mfa-confirm"),
            {"mfa_token": token, "code": _code(secret, NOW)},
            format="json",
        )
        self.assertEqual(confirm.status_code, status.HTTP_200_OK, confirm.data)
        return secret, confirm.data["recovery_codes"]

    def _verify(self, token: str, **payload):
        return self.client.post(
            reverse("accounts:admin-mfa-verify"), {"mfa_token": token, **payload}, format="json"
        )

    def test_password_alone_gives_no_session(self) -> None:
        data = self._login()
        self.assertEqual(data["mfa_required"], True)
        self.assertEqual(data["setup_required"], True)
        self.assertNotIn("access", data)
        self.assertNotIn("refresh_token", self.client.cookies)

    def test_setup_then_sign_in_with_code(self) -> None:
        secret, recovery_codes = self._enroll()
        self.assertEqual(len(recovery_codes), 10)
        self.assertTrue(mfa.is_enrolled(User.objects.get(pk=self.admin.pk)))
        subjects = [message.subject for message in mail.outbox]
        self.assertIn("Two-factor sign-in was set up on your administrator account", subjects)

        data = self._login()
        self.assertEqual(data["setup_required"], False)
        later = NOW + 60  # A new 30-second step; the setup code is spent.
        self.clock.stop()
        with patch("accounts.mfa.time.time", return_value=later):
            response = self._verify(data["mfa_token"], code=_code(secret, later))
        self.clock.start()
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        me = self.client.get(
            reverse("accounts:admin-me"), HTTP_AUTHORIZATION=f"Bearer {response.data['access']}"
        )
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertIn("Administrator sign-in to 3D Asset Marketplace", [m.subject for m in mail.outbox])

    def test_code_cannot_be_replayed(self) -> None:
        secret, _codes = self._enroll()
        token = self._login()["mfa_token"]
        # The setup step already used this time step.
        response = self._verify(token, code=_code(secret, NOW))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "mfa_invalid")

    def test_recovery_code_works_once(self) -> None:
        _secret, codes = self._enroll()
        token = self._login()["mfa_token"]
        self.assertEqual(self._verify(token, recovery_code=codes[0].lower()).status_code, 200)
        token = self._login()["mfa_token"]
        self.assertEqual(self._verify(token, recovery_code=codes[0]).status_code, 400)
        self.assertEqual(mfa.remaining_recovery_codes(self.admin), 9)

    def test_password_change_between_steps_voids_the_token(self) -> None:
        secret, _codes = self._enroll()
        token = self._login()["mfa_token"]
        User.objects.filter(pk=self.admin.pk).update(token_version=99)
        response = self._verify(token, code=_code(secret, NOW + 60))
        self.assertEqual(response.data["code"], "mfa_expired")

    def test_customer_cannot_use_the_code_step(self) -> None:
        customer = User.objects.create_user(
            email="not-admin@example.com",
            full_name="Customer",
            password=PASSWORD,
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        response = self.client.post(
            reverse("accounts:admin-mfa-setup"),
            {"mfa_token": mfa.issue_mfa_token(customer)},
            format="json",
        )
        self.assertEqual(response.data["code"], "mfa_expired")

    def test_wrong_codes_lock_the_account(self) -> None:
        self._enroll()
        cache.clear()
        token = self._login()["mfa_token"]
        statuses = []
        for _ in range(11):
            # Bypass the per-minute request throttle; the account lockout is what is tested.
            with patch("rest_framework.throttling.SimpleRateThrottle.allow_request", return_value=True):
                statuses.append(self._verify(token, code="000000").status_code)
        self.assertEqual(statuses[-1], status.HTTP_429_TOO_MANY_REQUESTS)

    def test_admin_token_without_second_factor_is_rejected(self) -> None:
        tokens = AuthenticationService.build_tokens(self.admin)  # No mfa claim.
        me = self.client.get(
            reverse("accounts:admin-me"), HTTP_AUTHORIZATION=f"Bearer {tokens['access']}"
        )
        self.assertEqual(me.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_recovery_codes_can_be_replaced_with_a_current_code(self) -> None:
        secret, old_codes = self._enroll()
        access = AuthenticationService.build_tokens(self.admin, mfa=True)["access"]
        auth = {"HTTP_AUTHORIZATION": f"Bearer {access}"}
        url = reverse("accounts:admin-mfa-recovery-codes")
        self.assertEqual(self.client.get(url, **auth).data, {"enrolled": True, "remaining": 10})
        later = NOW + 90
        self.clock.stop()
        with patch("accounts.mfa.time.time", return_value=later):
            response = self.client.post(url, {"code": _code(secret, later)}, format="json", **auth)
        self.clock.start()
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(response.data["recovery_codes"]), 10)
        self.assertFalse(mfa.use_recovery_code(self.admin, old_codes[0]))

    def test_reset_command_requires_new_setup_and_signs_out(self) -> None:
        self._enroll()
        before = User.objects.get(pk=self.admin.pk).token_version
        call_command("reset_admin_mfa", "--email", self.admin.email, stdout=StringIO())
        admin = User.objects.get(pk=self.admin.pk)
        self.assertFalse(mfa.is_enrolled(admin))
        self.assertGreater(admin.token_version, before)
        self.assertFalse(AdminRecoveryCode.objects.filter(user=admin).exists())
        self.assertEqual(self._login()["setup_required"], True)

    def test_secret_is_not_stored(self) -> None:
        secret, _codes = self._enroll()
        admin = User.objects.get(pk=self.admin.pk)
        stored = " ".join(str(value) for value in admin.__dict__.values())
        self.assertNotIn(secret, stored)


@override_settings(ADMIN_MFA_REQUIRED=True, ADMIN_SESSION_MAX_HOURS=8)
class AdminSessionLimitTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin = User.objects.create_user(
            email="session-admin@example.com",
            full_name="Session Admin",
            password=PASSWORD,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        self.customer = User.objects.create_user(
            email="session-customer@example.com",
            full_name="Session Customer",
            password=PASSWORD,
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )

    def _refresh(self, refresh_token: str):
        self.client.cookies["refresh_token"] = refresh_token
        return self.client.post(reverse("accounts:token-refresh"))

    def test_admin_session_ends_after_the_limit(self) -> None:
        nine_hours_ago = int(time.time()) - 9 * 3600
        tokens = AuthenticationService.build_tokens(self.admin, auth_time=nine_hours_ago, mfa=True)
        me = self.client.get(
            reverse("accounts:admin-me"), HTTP_AUTHORIZATION=f"Bearer {tokens['access']}"
        )
        self.assertEqual(me.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self._refresh(tokens["refresh"]).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_keeps_the_original_sign_in_time(self) -> None:
        signed_in = int(time.time()) - 3600
        tokens = AuthenticationService.build_tokens(self.admin, auth_time=signed_in, mfa=True)
        # A remembered browser, which would otherwise get the 30-day customer cookie.
        self.client.cookies[settings.JWT_REFRESH_REMEMBER_COOKIE_NAME] = "1"
        response = self._refresh(tokens["refresh"])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        from rest_framework_simplejwt.tokens import AccessToken

        access = AccessToken(response.data["access"])
        self.assertEqual(access["auth_time"], signed_in)
        self.assertLessEqual(access["exp"], signed_in + 8 * 3600)
        self.assertLessEqual(int(self.client.cookies["refresh_token"]["max-age"]), 8 * 3600)

    def test_admin_refresh_without_second_factor_is_rejected(self) -> None:
        tokens = AuthenticationService.build_tokens(self.admin)
        self.assertEqual(self._refresh(tokens["refresh"]).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customer_sessions_keep_their_length(self) -> None:
        nine_hours_ago = int(time.time()) - 9 * 3600
        tokens = AuthenticationService.build_tokens(self.customer, auth_time=nine_hours_ago)
        self.assertEqual(self._refresh(tokens["refresh"]).status_code, status.HTTP_200_OK)


class SettingsGuardTests(SimpleTestCase):
    def test_production_refuses_admin_mfa_off(self) -> None:
        result = import_settings(DEPLOYMENT_PROFILE="production", ADMIN_MFA_REQUIRED="False")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ADMIN_MFA_REQUIRED cannot be turned off", result.stderr)

    def test_development_allows_admin_mfa_off(self) -> None:
        result = import_settings(ADMIN_MFA_REQUIRED="False")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_production_refuses_django_admin(self) -> None:
        result = import_settings(
            DEPLOYMENT_PROFILE="production",
            ADMIN_MFA_REQUIRED="True",
            DJANGO_ADMIN_ENABLED="True",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DJANGO_ADMIN_ENABLED must be False in production", result.stderr)


@override_settings(PASSWORD_BREACH_CHECK=True)
class BreachedPasswordTests(SimpleTestCase):
    # SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8.
    def _response(self, body: str) -> MagicMock:
        response = MagicMock()
        response.text = body
        response.raise_for_status.return_value = None
        return response

    @patch("accounts.password_validation.requests.get")
    def test_breached_password_is_rejected(self, get) -> None:
        get.return_value = self._response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\nAAA:1")
        with self.assertRaises(ValidationError):
            BreachedPasswordValidator().validate("password")
        url = get.call_args.args[0]
        self.assertTrue(url.endswith("/range/5BAA6"))
        # Only the first five hash characters leave the server.
        self.assertNotIn("1E4C9B93F3F0682250B6CF8331B7EE68FD8", url)

    @patch("accounts.password_validation.requests.get")
    def test_padding_entries_with_zero_count_pass(self, get) -> None:
        get.return_value = self._response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:0")
        BreachedPasswordValidator().validate("password")

    @patch("accounts.password_validation.requests.get", side_effect=requests.Timeout())
    def test_service_outage_fails_open(self, _get) -> None:
        BreachedPasswordValidator().validate("password")

    @override_settings(PASSWORD_BREACH_CHECK=False)
    @patch("accounts.password_validation.requests.get")
    def test_switch_off_skips_the_lookup(self, get) -> None:
        BreachedPasswordValidator().validate("password")
        get.assert_not_called()


class NewDeviceEmailTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.user = User.objects.create_user(
            email="device-owner@example.com",
            full_name="Device Owner",
            password=PASSWORD,
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )

    def _login(self):
        response = self.client.post(
            reverse("accounts:login"),
            {"email": self.user.email, "password": PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response

    def _device_emails(self) -> list:
        return [m for m in mail.outbox if m.subject.startswith("New sign-in")]

    def test_first_device_is_recorded_silently(self) -> None:
        response = self._login()
        self.assertIn(DEVICE_COOKIE_NAME, response.cookies)
        self.assertTrue(response.cookies[DEVICE_COOKIE_NAME]["httponly"])
        self.assertEqual(KnownDevice.objects.filter(user=self.user).count(), 1)
        self.assertEqual(self._device_emails(), [])
        # The cookie value itself is never stored.
        raw = response.cookies[DEVICE_COOKIE_NAME].value
        self.assertFalse(KnownDevice.objects.filter(device_hash=raw).exists())

    def test_same_browser_is_quiet_new_browser_is_emailed(self) -> None:
        self._login()
        self._login()  # Same client keeps the device cookie.
        self.assertEqual(self._device_emails(), [])

        self.client.cookies.pop(DEVICE_COOKIE_NAME)
        self._login()
        emails = self._device_emails()
        self.assertEqual(len(emails), 1)
        self.assertEqual(emails[0].to, [self.user.email])
        self.assertIn("/forgot-password", emails[0].body)
