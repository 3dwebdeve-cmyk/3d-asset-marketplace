"""A fresh authenticator code before dangerous administrator actions, and ending an
administrator session when a rotated refresh token is used again."""

from __future__ import annotations

import uuid
from datetime import timedelta
from unittest.mock import patch

import jwt
from django.conf import settings
from django.core import mail
from django.core.cache import cache
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from accounts import mfa, refresh_reuse, sessions
from accounts.models import ActivityLog, Role, User, UserSession
from config.settings_guard_testing import import_settings

PASSWORD = "Admin-Strong-Pass-2026!"
NOW = 1_800_000_000.0  # Fixed authenticator clock, so codes are predictable.


class _AdminSessionMixin:
    """Sign an enrolled administrator in through the real password + code flow."""

    def _make_admin(self, email: str = "stepup-admin@example.com") -> User:
        admin = User.objects.create_user(
            email=email,
            full_name="Step Up Admin",
            password=PASSWORD,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        admin.mfa_nonce = uuid.uuid4().hex
        admin.mfa_enabled_at = timezone.now()
        admin.save(update_fields=["mfa_nonce", "mfa_enabled_at"])
        return admin

    def _start_clock(self) -> None:
        self.now = NOW
        clock = patch("accounts.mfa.time.time", side_effect=lambda: self.now)
        clock.start()
        self.addCleanup(clock.stop)

    def _code(self, user: User, *, at: float | None = None) -> str:
        secret = mfa.derive_secret(user, user.mfa_nonce)
        return mfa.hotp(secret, mfa.current_counter(self.now if at is None else at))

    def _next_step(self) -> None:
        """Move the authenticator clock on one 30-second step, so a new code is valid."""
        self.now += mfa.TOTP_PERIOD

    def _sign_in(self, user: User, client: APIClient | None = None) -> APIClient:
        """Return a client holding the access header and the refresh cookie."""
        client = client or APIClient()
        cache.clear()  # Each test signs in several times; reset the per-minute throttle.
        login = client.post(
            reverse("accounts:admin-login"),
            {"email": user.email, "password": PASSWORD},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK, login.data)
        verify = client.post(
            reverse("accounts:admin-mfa-verify"),
            {"mfa_token": login.data["mfa_token"], "code": self._code(user)},
            format="json",
        )
        self.assertEqual(verify.status_code, status.HTTP_200_OK, verify.data)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {verify.data['access']}")
        self._next_step()  # The sign-in code is spent; the next request needs a newer one.
        return client


@override_settings(ADMIN_MFA_REQUIRED=True, ADMIN_STEP_UP_REQUIRED=True, ADMIN_STEP_UP_MINUTES=5)
class AdminStepUpTests(_AdminSessionMixin, APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self._start_clock()
        self.admin = self._make_admin()
        self.customer = User.objects.create_user(
            email="stepup-customer@example.com",
            full_name="Customer",
            password="Customer-Pass-2026!",
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        self.client = self._sign_in(self.admin)
        self.step_up_url = reverse("accounts:admin-step-up")
        self.customer_url = reverse("accounts:admin-user-detail", args=[self.customer.pk])

    def _step_up(self, client: APIClient | None = None, **payload):
        return (client or self.client).post(self.step_up_url, payload, format="json")

    def _make_admin_role_change(self, client: APIClient | None = None):
        return (client or self.client).patch(
            self.customer_url, {"role": "Administrator"}, format="json"
        )

    # ----- Asking ------------------------------------------------------------------

    def test_dangerous_action_asks_for_a_code_and_changes_nothing(self) -> None:
        response = self._make_admin_role_change()

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)
        self.assertEqual(response.data["code"], "step_up_required")
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.role.role_name, "Customer")

    def test_every_dangerous_route_asks(self) -> None:
        missing = uuid.uuid4()
        routes = [
            ("post", reverse("accounts:admin-users")),
            ("patch", self.customer_url),
            ("delete", self.customer_url),
            ("post", reverse("products_admin:admin-product-purge", args=[missing])),
            ("post", reverse("products_admin:admin-product-bulk-delete")),
            ("post", reverse("products_admin:admin-catalog-import")),
            ("post", reverse("products_admin:admin-pricing-publish")),
            ("patch", reverse("orders_admin:admin-order-detail", args=[missing])),
        ]
        for method, url in routes:
            with self.subTest(method=method, url=url):
                # The PATCH to the user changes the role, which is what makes it dangerous.
                body = {"role": "Administrator"} if url == self.customer_url else {}
                response = getattr(self.client, method)(url, body, format="json")
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)
                self.assertEqual(response.data["code"], "step_up_required")

    def test_reads_never_ask(self) -> None:
        for url in (
            reverse("accounts:admin-users"),
            self.customer_url,
            reverse("orders_admin:admin-order-list-create"),
        ):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)

    def test_profile_edit_that_keeps_role_and_status_does_not_ask(self) -> None:
        # The console form sends every field on each save; unchanged values are not changes.
        response = self.client.patch(
            self.customer_url,
            {
                "full_name": "Renamed Customer",
                "role": "Customer",
                "is_active": True,
                "email_verified": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.full_name, "Renamed Customer")

    def test_status_and_verification_changes_ask(self) -> None:
        for body in ({"is_active": False}, {"email_verified": False}):
            with self.subTest(body=body):
                response = self.client.patch(self.customer_url, body, format="json")
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, response.data)
                self.assertEqual(response.data["code"], "step_up_required")

    # ----- Entering a code ---------------------------------------------------------

    def test_correct_code_opens_the_window_and_the_action_goes_through(self) -> None:
        step = self._step_up(code=self._code(self.admin))

        self.assertEqual(step.status_code, status.HTTP_200_OK, step.data)
        self.assertEqual(step.data["expires_in"], 300)
        response = self._make_admin_role_change()
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.role.role_name, "Administrator")
        self.assertTrue(
            ActivityLog.objects.filter(
                actor=self.admin, action="admin_step_up", metadata__method="totp"
            ).exists()
        )

    def test_one_code_covers_several_actions_inside_the_window(self) -> None:
        self.assertEqual(self._step_up(code=self._code(self.admin)).status_code, status.HTTP_200_OK)

        self.assertEqual(self._make_admin_role_change().status_code, status.HTTP_200_OK)
        response = self.client.patch(self.customer_url, {"role": "Customer"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_window_closes_after_the_configured_minutes(self) -> None:
        self.assertEqual(self._step_up(code=self._code(self.admin)).status_code, status.HTTP_200_OK)
        session = UserSession.objects.get(user=self.admin, revoked_at__isnull=True)
        self.assertAlmostEqual(
            (session.step_up_until - timezone.now()).total_seconds(), 300, delta=10
        )

        UserSession.objects.filter(pk=session.pk).update(
            step_up_until=timezone.now() - timedelta(seconds=1)
        )

        response = self._make_admin_role_change()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["code"], "step_up_required")

    def test_the_sign_in_code_cannot_be_used_again(self) -> None:
        sign_in_code = self._code(self.admin, at=self.now - mfa.TOTP_PERIOD)

        response = self._step_up(code=sign_in_code)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "mfa_invalid")

    def test_wrong_code_is_refused_and_counts_toward_the_lockout(self) -> None:
        response = self._step_up(code="000000")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "mfa_invalid")
        self.assertEqual(self._make_admin_role_change().status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(LOGIN_LOCKOUT_MAX_FAILURES=3)
    def test_repeated_wrong_codes_lock_the_prompt(self) -> None:
        for _ in range(3):
            self._step_up(code="000000")

        response = self._step_up(code=self._code(self.admin))

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(self._make_admin_role_change().status_code, status.HTTP_403_FORBIDDEN)

    def test_a_recovery_code_works_once(self) -> None:
        recovery = mfa.replace_recovery_codes(self.admin)[0]

        first = self._step_up(recovery_code=recovery)
        second = self._step_up(recovery_code=recovery)

        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_code_and_recovery_code_together_are_refused(self) -> None:
        response = self._step_up(code=self._code(self.admin), recovery_code="ABCDE-FGHIJ")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_the_window_belongs_to_the_session_that_entered_the_code(self) -> None:
        other_browser = self._sign_in(self.admin)
        self.assertEqual(
            self._step_up(other_browser, code=self._code(self.admin)).status_code,
            status.HTTP_200_OK,
        )

        response = self._make_admin_role_change()  # The first browser entered no code.

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self._make_admin_role_change(other_browser).status_code, status.HTTP_200_OK)

    def test_signing_out_ends_the_window(self) -> None:
        self.assertEqual(self._step_up(code=self._code(self.admin)).status_code, status.HTTP_200_OK)

        self.client.post(reverse("accounts:logout"), {}, format="json")

        self.assertEqual(self._make_admin_role_change().status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customers_cannot_use_the_prompt(self) -> None:
        client = APIClient()
        client.force_authenticate(self.customer)

        response = client.post(self.step_up_url, {"code": "123456"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_token_without_a_session_cannot_open_a_window(self) -> None:
        client = APIClient()
        client.force_authenticate(self.admin)  # No JWT, so no ``sid``.

        response = client.post(self.step_up_url, {"code": self._code(self.admin)}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "session_ended")
        # The code was not spent on a session that could not use it.
        self.assertEqual(self._step_up(code=self._code(self.admin)).status_code, status.HTTP_200_OK)

    @override_settings(ADMIN_STEP_UP_REQUIRED=False)
    def test_turned_off_it_never_asks(self) -> None:
        self.assertEqual(self._make_admin_role_change().status_code, status.HTTP_200_OK)


@override_settings(ADMIN_MFA_REQUIRED=True, ADMIN_REFRESH_REUSE_GRACE_SECONDS=30)
class AdminRefreshReuseTests(_AdminSessionMixin, APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self._start_clock()
        self.admin = self._make_admin("reuse-admin@example.com")
        self.refresh_url = reverse("accounts:token-refresh")
        self.admin_me_url = reverse("accounts:admin-me")
        self.cookie = settings.JWT_REFRESH_COOKIE_NAME

    def _rotate(self, client: APIClient) -> tuple[str, str]:
        """Refresh once. Returns (old refresh, new refresh); the client keeps the new one."""
        old = client.cookies[self.cookie].value
        response = client.post(self.refresh_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return old, response.cookies[self.cookie].value

    def _age_rotation(self, raw: str, seconds: int) -> None:
        jti = RefreshToken(raw, verify=False)["jti"]
        BlacklistedToken.objects.filter(token__jti=jti).update(
            blacklisted_at=timezone.now() - timedelta(seconds=seconds)
        )

    def _copy_with_cookie(self, raw: str) -> APIClient:
        copy = APIClient(HTTP_USER_AGENT="Copied Browser/1.0")
        copy.cookies[self.cookie] = raw
        return copy

    def test_old_cookie_after_the_grace_period_ends_the_session_everywhere(self) -> None:
        holder = self._sign_in(self.admin)
        old, _new = self._rotate(holder)
        self._age_rotation(old, 60)
        mail.outbox.clear()

        response = self._copy_with_cookie(old).post(self.refresh_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "session_ended")
        self.assertEqual(response.cookies[self.cookie].value, "")
        session = UserSession.objects.get(user=self.admin)
        self.assertEqual(session.revoked_reason, sessions.REASON_REFRESH_REUSED)
        # The browser holding the newest cookie is signed out too, access and refresh.
        self.assertEqual(holder.get(self.admin_me_url).status_code, status.HTTP_401_UNAUTHORIZED)
        refresh = holder.post(self.refresh_url, {}, format="json")
        self.assertEqual(refresh.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(refresh.data["code"], "session_ended")
        # The administrator is told, and the console's activity log records it.
        alerts = [m for m in mail.outbox if "ended for safety" in m.subject]
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0].to, [self.admin.email])
        self.assertIn("Copied Browser/1.0", alerts[0].body)
        self.assertTrue(
            ActivityLog.objects.filter(
                actor=self.admin,
                action="admin_session_ended_refresh_reused",
                target_id=str(session.pk),
            ).exists()
        )

    def test_old_cookie_inside_the_grace_period_is_only_refused(self) -> None:
        # Two tabs refreshing at the same moment both send the old cookie.
        holder = self._sign_in(self.admin)
        old, _new = self._rotate(holder)

        response = self._copy_with_cookie(old).post(self.refresh_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "token_not_valid")
        self.assertNotIn(self.cookie, response.cookies)
        self.assertEqual(holder.get(self.admin_me_url).status_code, status.HTTP_200_OK)
        self.assertEqual(
            UserSession.objects.filter(user=self.admin, revoked_at__isnull=True).count(), 1
        )

    def test_reuse_after_sign_out_sends_no_alert(self) -> None:
        holder = self._sign_in(self.admin)
        old, _new = self._rotate(holder)
        holder.post(reverse("accounts:logout"), {}, format="json")
        self._age_rotation(old, 60)
        mail.outbox.clear()

        response = self._copy_with_cookie(old).post(self.refresh_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "token_not_valid")
        self.assertFalse([m for m in mail.outbox if "ended for safety" in m.subject])

    def test_only_one_alert_when_the_old_cookie_comes_back_twice(self) -> None:
        holder = self._sign_in(self.admin)
        old, _new = self._rotate(holder)
        self._age_rotation(old, 60)
        mail.outbox.clear()

        self._copy_with_cookie(old).post(self.refresh_url, {}, format="json")
        second = self._copy_with_cookie(old).post(self.refresh_url, {}, format="json")

        self.assertEqual(second.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(len([m for m in mail.outbox if "ended for safety" in m.subject]), 1)

    def test_a_forged_token_cannot_end_someone_else_session(self) -> None:
        holder = self._sign_in(self.admin)
        old, _new = self._rotate(holder)
        self._age_rotation(old, 60)
        # Same claims as the real rotated token (its jti and session), signed with another key.
        claims = RefreshToken(old, verify=False).payload
        forged = jwt.encode(dict(claims), "not-the-server-signing-key-" * 3, algorithm="HS256")
        request = RequestFactory().post(self.refresh_url)

        self.assertIsNone(refresh_reuse.end_session_if_reused(forged, request))
        self.assertEqual(holder.get(self.admin_me_url).status_code, status.HTTP_200_OK)
        self.assertEqual(
            UserSession.objects.filter(user=self.admin, revoked_at__isnull=True).count(), 1
        )


@override_settings(MAX_CUSTOMER_SESSIONS=2)
class CustomerRefreshReuseUnchangedTests(APITestCase):
    def test_customer_old_cookie_is_only_refused(self) -> None:
        cache.clear()
        customer = User.objects.create_user(
            email="reuse-customer@example.com",
            full_name="Customer",
            password="Customer-Pass-2026!",
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        cookie = settings.JWT_REFRESH_COOKIE_NAME
        login = self.client.post(
            reverse("accounts:login"),
            {"email": customer.email, "password": "Customer-Pass-2026!"},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK, login.data)
        old = self.client.cookies[cookie].value
        self.assertEqual(
            self.client.post(reverse("accounts:token-refresh"), {}, format="json").status_code,
            status.HTTP_200_OK,
        )
        jti = RefreshToken(old, verify=False)["jti"]
        BlacklistedToken.objects.filter(token__jti=jti).update(
            blacklisted_at=timezone.now() - timedelta(hours=1)
        )

        copy = APIClient()
        copy.cookies[cookie] = old
        response = copy.post(reverse("accounts:token-refresh"), {}, format="json")

        self.assertEqual(response.data["code"], "token_not_valid")
        self.assertTrue(UserSession.objects.filter(user=customer, revoked_at__isnull=True).exists())


class StepUpSettingsGuardTests(SimpleTestCase):
    def test_on_by_default_outside_the_test_runner(self) -> None:
        result = import_settings()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_production_refuses_step_up_off(self) -> None:
        result = import_settings(
            DEPLOYMENT_PROFILE="production",
            ADMIN_MFA_REQUIRED="True",
            ADMIN_STEP_UP_REQUIRED="False",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ADMIN_STEP_UP_REQUIRED cannot be turned off", result.stderr)

    def test_step_up_needs_two_factor_sign_in(self) -> None:
        result = import_settings(ADMIN_MFA_REQUIRED="False", ADMIN_STEP_UP_REQUIRED="True")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ADMIN_STEP_UP_REQUIRED needs ADMIN_MFA_REQUIRED", result.stderr)

    def test_development_without_two_factor_turns_step_up_off_too(self) -> None:
        result = import_settings(ADMIN_MFA_REQUIRED="False")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_window_and_grace_limits(self) -> None:
        for name, value, message in (
            ("ADMIN_STEP_UP_MINUTES", "0", "ADMIN_STEP_UP_MINUTES must be between 1 and 30"),
            ("ADMIN_STEP_UP_MINUTES", "31", "ADMIN_STEP_UP_MINUTES must be between 1 and 30"),
            (
                "ADMIN_REFRESH_REUSE_GRACE_SECONDS",
                "301",
                "ADMIN_REFRESH_REUSE_GRACE_SECONDS must be between 0 and 300",
            ),
        ):
            with self.subTest(name=name, value=value):
                result = import_settings(**{name: value})
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(message, result.stderr)
