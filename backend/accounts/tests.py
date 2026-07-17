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

    def _login(self, email: str | None = None, password: str | None = None) -> dict:
        response = self.client.post(
            self.login_url,
            {
                "email": email or self.user.email,
                "password": password or self.password,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

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
        }

        response = self.client.post(self.register_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password_confirm", response.data)
        self.assertFalse(User.objects.filter(email="mismatch@example.com").exists())

    def test_login_returns_tokens_and_user(self) -> None:
        data = self._login()

        self.assertIn("access", data)
        self.assertIn("refresh", data)
        self.assertEqual(data["user"]["email"], self.user.email)
        self.assertEqual(data["user"]["role"], "Customer")

    def test_login_is_case_insensitive_for_email(self) -> None:
        data = self._login(email="USER@EXAMPLE.COM")

        self.assertEqual(data["user"]["email"], self.user.email)

    def test_login_rejects_invalid_credentials(self) -> None:
        response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": "WrongPassword123!"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_authenticated_user(self) -> None:
        tokens = self._login()
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
        tokens = self._login()

        response = self.client.post(
            self.refresh_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertNotEqual(response.data["refresh"], tokens["refresh"])

        self._authenticate(response.data["access"])
        me_response = self.client.get(self.me_url)
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)

        # Rotated/blacklisted refresh token must no longer work.
        reused = self.client.post(
            self.refresh_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )
        self.assertEqual(reused.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_blacklists_refresh_token(self) -> None:
        tokens = self._login()
        self._authenticate(tokens["access"])

        logout_response = self.client.post(
            self.logout_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )

        self.assertEqual(logout_response.status_code, status.HTTP_204_NO_CONTENT)

        self.client.credentials()
        refresh_response = self.client.post(
            self.refresh_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )

        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_requires_authentication(self) -> None:
        tokens = self._login()

        response = self.client.post(
            self.logout_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_rejects_invalid_refresh_token(self) -> None:
        tokens = self._login()
        self._authenticate(tokens["access"])

        response = self.client.post(
            self.logout_url,
            {"refresh": "not-a-valid-refresh-token"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


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
            "company_name": "Acme Studios",
            "website": "https://acme.example.com",
            "address": "12 Market Street",
            "city": "Mumbai",
            "country": "India",
        }

        response = self.client.patch(self.profile_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
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

        self.client.credentials()
        login_response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": new_password},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

    def test_change_password_blacklists_outstanding_refresh_tokens(self) -> None:
        login_response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        refresh = login_response.data["refresh"]
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

        refresh_response = self.client.post(
            reverse("accounts:token-refresh"),
            {"refresh": refresh},
            format="json",
        )
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

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
