"""Sign-out must delete the refresh cookie on the path the browser stored it on.

The test client stores cookies by name only, so a delete on the wrong path still empties its
jar. A browser keys cookies by name and path and keeps the real one. These tests compare the
paths of the Set-Cookie headers themselves.
"""

from __future__ import annotations

from django.core.cache import cache
from django.http import HttpResponse
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from accounts.auth_cookies import (
    clear_refresh_cookie,
    refresh_cookie_name,
    remember_cookie_name,
)
from accounts.models import Role, User


def _is_deleted(morsel) -> bool:
    return morsel.value == "" and str(morsel["max-age"]) == "0"


class ClearRefreshCookieTests(SimpleTestCase):
    def test_deletes_both_cookies_on_the_refresh_path(self) -> None:
        response = HttpResponse()

        clear_refresh_cookie(response)

        for name in (refresh_cookie_name(), remember_cookie_name()):
            self.assertEqual(response.cookies[name]["path"], "/api/v1/auth/")
            self.assertTrue(_is_deleted(response.cookies[name]))

    @override_settings(JWT_REFRESH_COOKIE_PATH="/custom/auth/")
    def test_follows_a_configured_path(self) -> None:
        response = HttpResponse()

        clear_refresh_cookie(response)

        self.assertEqual(response.cookies[refresh_cookie_name()]["path"], "/custom/auth/")
        self.assertEqual(response.cookies[remember_cookie_name()]["path"], "/custom/auth/")


@override_settings(ADMIN_MFA_REQUIRED=False)
class SignOutDeletesTheStoredCookieTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"

    def _user(self, role_name: str) -> User:
        return User.objects.create_user(
            email=f"{role_name.lower()}-cookie@example.com",
            full_name=role_name,
            password=self.password,
            role=Role.objects.get(role_name=role_name),
            email_verified=True,
        )

    def _assert_sign_out_deletes_sign_in_cookie(self, login_url: str, user: User) -> None:
        client = APIClient()
        login = client.post(
            login_url,
            {"email": user.email, "password": self.password, "remember_me": True},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK, login.data)

        logout = client.post(reverse("accounts:logout"), {}, format="json")

        self.assertEqual(logout.status_code, status.HTTP_204_NO_CONTENT)
        for name in (refresh_cookie_name(), remember_cookie_name()):
            self.assertEqual(logout.cookies[name]["path"], login.cookies[name]["path"], name)
            self.assertTrue(_is_deleted(logout.cookies[name]), name)

    def test_administrator_sign_out(self) -> None:
        self._assert_sign_out_deletes_sign_in_cookie(
            reverse("accounts:admin-login"), self._user("Administrator")
        )

    def test_customer_sign_out(self) -> None:
        self._assert_sign_out_deletes_sign_in_cookie(
            reverse("accounts:login"), self._user("Customer")
        )
