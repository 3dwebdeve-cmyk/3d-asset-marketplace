from django.conf import settings
from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User, UserProfile


class AuthenticationAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            email="user@example.com",
            full_name="Existing User",
            password=self.password,
            role=self.customer_role,
            country="India",
            email_verified=True,
        )

        self.register_url = reverse("accounts:register")
        self.login_url = reverse("accounts:login")
        self.logout_url = reverse("accounts:logout")
        self.me_url = reverse("accounts:me")
        self.refresh_url = reverse("accounts:token-refresh")
        self.refresh_cookie = settings.JWT_REFRESH_COOKIE_NAME

    def _login(
        self,
        email: str | None = None,
        password: str | None = None,
        *,
        remember_me: bool = True,
    ):
        response = self.client.post(
            self.login_url,
            {
                "email": email or self.user.email,
                "password": password or self.password,
                "remember_me": remember_me,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response

    def _authenticate(self, access_token: str) -> None:
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

    def test_register_creates_customer_account(self) -> None:
        payload = {
            "full_name": "New Customer",
            "email": "New.Customer@Example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "phone": "",
            "country": "India",
            "accepted_legal": {
                "terms": "2026-09-18",
                "privacy": "2026-09-18",
            },
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "new.customer@example.com")
        self.assertEqual(response.data["role"], "Customer")
        self.assertFalse(response.data["email_verified"])
        self.assertNotIn("password", response.data)
        self.assertTrue(User.objects.filter(email="new.customer@example.com").exists())
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/verify-email/", mail.outbox[0].body)

    def test_register_rejects_duplicate_email(self) -> None:
        payload = {
            "full_name": "Duplicate User",
            "email": self.user.email,
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "accepted_legal": {
                "terms": "2026-09-18",
                "privacy": "2026-09-18",
            },
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_rejects_password_mismatch(self) -> None:
        payload = {
            "full_name": "Mismatch User",
            "email": "mismatch@example.com",
            "password": "StrongPass123!",
            "password_confirm": "DifferentPass123!",
            "accepted_legal": {
                "terms": "2026-09-18",
                "privacy": "2026-09-18",
            },
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password_confirm", response.data)
        self.assertFalse(User.objects.filter(email="mismatch@example.com").exists())

    def test_login_returns_tokens_and_user(self) -> None:
        response = self._login()
        data = response.data

        self.assertIn("access", data)
        self.assertNotIn("refresh", data)
        self.assertIn(self.refresh_cookie, response.cookies)
        self.assertTrue(response.cookies[self.refresh_cookie]["httponly"])
        self.assertEqual(data["user"]["email"], self.user.email)
        self.assertEqual(data["user"]["role"], "Customer")

    def test_login_session_cookie_when_remember_me_false(self) -> None:
        response = self._login(remember_me=False)

        cookie = response.cookies[self.refresh_cookie]
        self.assertEqual(cookie["max-age"], "")

    def test_login_is_case_insensitive_for_email(self) -> None:
        response = self._login(email="USER@EXAMPLE.COM")

        self.assertEqual(response.data["user"]["email"], self.user.email)

    def test_login_rejects_invalid_credentials(self) -> None:
        response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": "WrongPassword123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_authenticated_user(self) -> None:
        tokens = self._login().data
        self._authenticate(tokens["access"])

        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], self.user.email)
        self.assertEqual(str(response.data["id"]), str(self.user.id))

    def test_me_requires_authentication(self) -> None:
        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_protected_endpoint_rejects_invalid_token(self) -> None:
        self._authenticate("this-is-not-a-valid-token")

        response = self.client.get(self.me_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_returns_new_access_token(self) -> None:
        login_response = self._login()
        old_refresh = login_response.cookies[self.refresh_cookie].value

        response = self.client.post(self.refresh_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertIn(self.refresh_cookie, response.cookies)
        new_refresh = response.cookies[self.refresh_cookie].value
        self.assertNotEqual(new_refresh, old_refresh)

        self._authenticate(response.data["access"])
        me_response = self.client.get(self.me_url)
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)

        # Rotated/blacklisted refresh token must no longer work, and must not
        # delete the replacement cookie a concurrent checkout return just stored.
        self.client.cookies[self.refresh_cookie] = old_refresh
        reused = self.client.post(self.refresh_url, {}, format="json")
        self.assertEqual(reused.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn(self.refresh_cookie, reused.cookies)

    def test_refresh_clears_cookie_when_token_is_malformed(self) -> None:
        self.client.cookies[self.refresh_cookie] = "not-a-valid-refresh-token"
        response = self.client.post(self.refresh_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        cleared = response.cookies.get(self.refresh_cookie)
        self.assertIsNotNone(cleared)
        self.assertEqual(cleared.value, "")

    def test_refresh_rejects_body_refresh_without_cookie(self) -> None:
        from accounts.services import AuthenticationService

        tokens = AuthenticationService.build_tokens(self.user)
        self.client.cookies.clear()
        response = self.client.post(
            self.refresh_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_blacklists_refresh_token(self) -> None:
        login_response = self._login()
        old_refresh = login_response.cookies[self.refresh_cookie].value
        self._authenticate(login_response.data["access"])

        logout_response = self.client.post(self.logout_url, {}, format="json")

        self.assertEqual(logout_response.status_code, status.HTTP_204_NO_CONTENT)
        # Cleared cookie (empty or deleted).
        cleared = logout_response.cookies.get(self.refresh_cookie)
        self.assertTrue(cleared is None or cleared.value == "")

        self.client.credentials()
        self.client.cookies[self.refresh_cookie] = old_refresh
        refresh_response = self.client.post(self.refresh_url, {}, format="json")

        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_works_with_cookie_only(self) -> None:
        self._login()
        self.client.credentials()

        response = self.client.post(self.logout_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_logout_rejects_invalid_refresh_token(self) -> None:
        login_response = self._login()
        self._authenticate(login_response.data["access"])
        self.client.cookies[self.refresh_cookie] = "not-a-valid-refresh-token"

        response = self.client.post(self.logout_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_rejects_another_users_refresh_token(self) -> None:
        other = User.objects.create_user(
            email="other-logout@example.com",
            full_name="Other User",
            password=self.password,
            role=self.customer_role,
            country="India",
            email_verified=True,
        )
        other_login = self.client.post(
            self.login_url,
            {"email": other.email, "password": self.password},
            format="json",
        )
        self.assertEqual(other_login.status_code, status.HTTP_200_OK)
        other_refresh = other_login.cookies[self.refresh_cookie].value

        # Fresh client session for the primary user, then swap in victim cookie.
        self.client.cookies.clear()
        tokens = self._login()
        self._authenticate(tokens.data["access"])
        self.client.cookies[self.refresh_cookie] = other_refresh
        response = self.client.post(self.logout_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        # Victim refresh must remain usable.
        self.client.credentials()
        self.client.cookies.clear()
        self.client.cookies[self.refresh_cookie] = other_refresh
        refresh_response = self.client.post(self.refresh_url, {}, format="json")
        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)


class ProfileAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            email="profile-user@example.com",
            full_name="Profile User",
            password=self.password,
            role=self.customer_role,
            country="India",
            email_verified=True,
        )
        self.profile_url = reverse("accounts:profile")
        self.login_url = reverse("accounts:login")

    def _authenticate(self) -> None:
        response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_profile_requires_authentication(self) -> None:
        get_response = self.client.get(self.profile_url)
        self.assertEqual(get_response.status_code, status.HTTP_401_UNAUTHORIZED)

        patch_response = self.client.patch(self.profile_url, {}, format="json")
        self.assertEqual(patch_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_profile_creates_row_when_missing(self) -> None:
        self.assertFalse(UserProfile.objects.filter(user=self.user).exists())

        self._authenticate()
        response = self.client.get(self.profile_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], self.user.email)
        self.assertEqual(response.data["full_name"], self.user.full_name)
        self.assertEqual(response.data["country"], "India")
        self.assertEqual(response.data["company_name"], "")
        self.assertEqual(response.data["website"], "")
        self.assertEqual(response.data["address"], "")
        self.assertEqual(response.data["city"], "")
        self.assertTrue(UserProfile.objects.filter(user=self.user).exists())

    def test_patch_profile_updates_fields(self) -> None:
        self._authenticate()
        payload = {
            "full_name": "Updated Profile User",
            "company_name": "Acme Studios",
            "website": "https://acme.example.com",
            "address": "12 Market Street",
            "city": "Mumbai",
            "country": "India",
        }

        response = self.client.patch(self.profile_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["full_name"], "Updated Profile User")
        self.assertEqual(response.data["company_name"], "Acme Studios")
        self.assertEqual(response.data["website"], "https://acme.example.com")
        self.assertEqual(response.data["address"], "12 Market Street")
        self.assertEqual(response.data["city"], "Mumbai")
        self.assertEqual(response.data["country"], "India")

        self.user.refresh_from_db()
        self.assertEqual(self.user.country, "India")
        profile = self.user.profile
        self.assertEqual(profile.company_name, "Acme Studios")
        self.assertEqual(profile.city, "Mumbai")

    def test_patch_profile_rejects_invalid_website(self) -> None:
        self._authenticate()

        response = self.client.patch(
            self.profile_url,
            {"website": "not-a-url"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("website", response.data)

    def test_patch_profile_ignores_email_changes(self) -> None:
        self._authenticate()
        original_email = self.user.email

        response = self.client.patch(
            self.profile_url,
            {
                "email": "hacker@example.com",
                "company_name": "Safe Co",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], original_email)
        self.assertEqual(response.data["company_name"], "Safe Co")
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, original_email)


class ChangePasswordAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            email="password-user@example.com",
            full_name="Password User",
            password=self.password,
            role=self.customer_role,
            country="India",
            email_verified=True,
        )
        self.change_password_url = reverse("accounts:change-password")
        self.login_url = reverse("accounts:login")

    def _authenticate(self) -> None:
        response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_change_password_requires_authentication(self) -> None:
        response = self.client.post(
            self.change_password_url,
            {
                "current_password": self.password,
                "new_password": "AnotherStrong123!",
                "new_password_confirm": "AnotherStrong123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_change_password_updates_credentials(self) -> None:
        self._authenticate()
        new_password = "AnotherStrong123!"

        response = self.client.post(
            self.change_password_url,
            {
                "current_password": self.password,
                "new_password": new_password,
                "new_password_confirm": new_password,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(new_password))
        self.assertFalse(self.user.check_password(self.password))
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.user.email, mail.outbox[0].to)
        self.assertIn("password was just changed", mail.outbox[0].body.lower())

        self.client.credentials()
        login_response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": new_password},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

    def test_change_password_rejects_unverified_email(self) -> None:
        self.user.email_verified = False
        self.user.save(update_fields=["email_verified", "updated_at"])
        from accounts.services import AuthenticationService

        access = AuthenticationService.build_tokens(self.user)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        response = self.client.post(
            self.change_password_url,
            {
                "current_password": self.password,
                "new_password": "AnotherStrong123!",
                "new_password_confirm": "AnotherStrong123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["code"], "email_not_verified")
        self.assertEqual(len(mail.outbox), 0)

    def test_change_password_blacklists_outstanding_refresh_tokens(self) -> None:
        from django.conf import settings

        login_response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        cookie_name = settings.JWT_REFRESH_COOKIE_NAME
        refresh = login_response.cookies[cookie_name].value
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}"
        )
        new_password = "AnotherStrong123!"

        response = self.client.post(
            self.change_password_url,
            {
                "current_password": self.password,
                "new_password": new_password,
                "new_password_confirm": new_password,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        self.client.cookies[cookie_name] = refresh
        refresh_response = self.client.post(
            reverse("accounts:token-refresh"),
            {},
            format="json",
        )
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_change_password_rejects_stale_access_token(self) -> None:
        login_response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        old_access = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {old_access}")
        new_password = "AnotherStrong123!"

        changed = self.client.post(
            self.change_password_url,
            {
                "current_password": self.password,
                "new_password": new_password,
                "new_password_confirm": new_password,
            },
            format="json",
        )
        self.assertEqual(changed.status_code, status.HTTP_204_NO_CONTENT)
        self.user.refresh_from_db()
        self.assertEqual(self.user.token_version, 1)

        me_url = reverse("accounts:me")
        stale = self.client.get(me_url)
        self.assertEqual(stale.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.credentials()
        fresh_login = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": new_password},
            format="json",
        )
        self.assertEqual(fresh_login.status_code, status.HTTP_200_OK)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {fresh_login.data['access']}"
        )
        ok = self.client.get(me_url)
        self.assertEqual(ok.status_code, status.HTTP_200_OK)

    def test_change_password_rejects_wrong_current_password(self) -> None:
        self._authenticate()

        response = self.client.post(
            self.change_password_url,
            {
                "current_password": "WrongPass123!",
                "new_password": "AnotherStrong123!",
                "new_password_confirm": "AnotherStrong123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current_password", response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.password))

    def test_change_password_rejects_mismatched_confirmation(self) -> None:
        self._authenticate()

        response = self.client.post(
            self.change_password_url,
            {
                "current_password": self.password,
                "new_password": "AnotherStrong123!",
                "new_password_confirm": "DifferentStrong123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password_confirm", response.data)

    def test_change_password_rejects_same_as_current(self) -> None:
        self._authenticate()

        response = self.client.post(
            self.change_password_url,
            {
                "current_password": self.password,
                "new_password": self.password,
                "new_password_confirm": self.password,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password", response.data)
