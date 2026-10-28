"""Customer accounts stay signed in on at most MAX_CUSTOMER_SESSIONS devices."""

from __future__ import annotations

from django.conf import settings
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.models import Role, User, UserSession
from accounts.services import AuthenticationService
from accounts.tokens import VersionedRefreshToken


@override_settings(MAX_CUSTOMER_SESSIONS=2)
class DeviceSessionLimitTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            email="devices@example.com",
            full_name="Device User",
            password=self.password,
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        self.login_url = reverse("accounts:login")
        self.me_url = reverse("accounts:me")
        self.refresh_url = reverse("accounts:token-refresh")
        self.logout_url = reverse("accounts:logout")
        self.refresh_cookie = settings.JWT_REFRESH_COOKIE_NAME

    def _device(self, email: str | None = None, password: str | None = None) -> APIClient:
        """Sign in from a fresh browser and leave it holding the access token."""
        client = APIClient()
        response = client.post(
            self.login_url,
            {"email": email or self.user.email, "password": password or self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return client

    def _active_sessions(self, user: User | None = None) -> int:
        return UserSession.objects.filter(
            user=user or self.user, revoked_at__isnull=True
        ).count()

    def test_two_devices_stay_signed_in(self) -> None:
        first = self._device()
        second = self._device()

        self.assertEqual(first.get(self.me_url).status_code, status.HTTP_200_OK)
        self.assertEqual(second.get(self.me_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self._active_sessions(), 2)

    def test_third_device_signs_out_least_recently_used_immediately(self) -> None:
        first = self._device()
        second = self._device()
        third = self._device()

        # The ended device fails on its very next request, not when its token expires.
        self.assertEqual(first.get(self.me_url).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(second.get(self.me_url).status_code, status.HTTP_200_OK)
        self.assertEqual(third.get(self.me_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self._active_sessions(), 2)

    def test_ended_device_cannot_refresh_and_learns_why(self) -> None:
        first = self._device()
        self._device()
        self._device()

        response = first.post(self.refresh_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["code"], "session_replaced")
        self.assertEqual(response.cookies[self.refresh_cookie].value, "")

    def test_refresh_keeps_the_device_in_use(self) -> None:
        first = self._device()
        second = self._device()
        # Using the first device makes the second the least recently used one.
        refreshed = first.post(self.refresh_url, {}, format="json")
        self.assertEqual(refreshed.status_code, status.HTTP_200_OK)
        first.credentials(HTTP_AUTHORIZATION=f"Bearer {refreshed.data['access']}")

        self._device()

        self.assertEqual(first.get(self.me_url).status_code, status.HTTP_200_OK)
        self.assertEqual(second.get(self.me_url).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_signing_in_again_on_one_browser_does_not_end_the_other_device(self) -> None:
        other = self._device()
        browser = self._device()
        login = {"email": self.user.email, "password": self.password}

        again = browser.post(self.login_url, login, format="json")

        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertEqual(other.get(self.me_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self._active_sessions(), 2)

    def test_logout_frees_the_slot(self) -> None:
        first = self._device()
        second = self._device()

        self.assertEqual(
            second.post(self.logout_url, {}, format="json").status_code,
            status.HTTP_204_NO_CONTENT,
        )
        self._device()

        self.assertEqual(first.get(self.me_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self._active_sessions(), 2)

    def test_password_change_ends_every_session(self) -> None:
        first = self._device()
        second = self._device()

        AuthenticationService.change_password(self.user, self.password, "AnotherPass456!")

        self.assertEqual(self._active_sessions(), 0)
        refreshed = first.post(self.refresh_url, {}, format="json")
        self.assertEqual(refreshed.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(second.get(self.me_url).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_limit_is_per_account(self) -> None:
        other = User.objects.create_user(
            email="someone-else@example.com",
            full_name="Other",
            password=self.password,
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )
        mine = self._device()
        self._device()
        self._device(email=other.email)
        self._device(email=other.email)

        self.assertEqual(mine.get(self.me_url).status_code, status.HTTP_200_OK)

    def test_session_from_before_the_limit_joins_it_on_refresh(self) -> None:
        legacy = APIClient()
        legacy.cookies[self.refresh_cookie] = str(VersionedRefreshToken.for_user(self.user))
        self._device()
        self._device()

        response = legacy.post(self.refresh_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._active_sessions(), 2)


@override_settings(MAX_CUSTOMER_SESSIONS=2, ADMIN_MFA_REQUIRED=False)
class AdministratorSessionsAreNotLimitedTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.admin = User.objects.create_user(
            email="admin-devices@example.com",
            full_name="Admin",
            password=self.password,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )

    def test_many_admin_devices_stay_signed_in(self) -> None:
        clients = []
        for _ in range(4):
            client = APIClient()
            response = client.post(
                reverse("accounts:admin-login"),
                {"email": self.admin.email, "password": self.password},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
            clients.append(client)

        for client in clients:
            self.assertEqual(
                client.get(reverse("accounts:admin-me")).status_code, status.HTTP_200_OK
            )
        self.assertFalse(UserSession.objects.filter(user=self.admin).exists())
