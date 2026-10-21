from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from accounts.services import AuthenticationService
from accounts.throttles import (
    ChangePasswordRateThrottle,
    LoginRateThrottle,
    PasswordResetEmailRateThrottle,
    PasswordResetRateThrottle,
    RegisterRateThrottle,
)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "auth-throttle-tests",
        }
    }
)
class AuthThrottleAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            email="throttle-user@example.com",
            full_name="Throttle User",
            password=self.password,
            role=self.customer_role,
            country="India",
            email_verified=True,
        )
        self.login_url = reverse("accounts:login")
        self.register_url = reverse("accounts:register")

    @patch.object(LoginRateThrottle, "rate", "1/min", create=True)
    def test_login_is_throttled_after_limit(self) -> None:
        first = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": "WrongPassword1!"},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_401_UNAUTHORIZED)

        second = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": "WrongPassword1!"},
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(second.data.get("code"), "throttled")
        self.assertIn("Too many attempts", second.data.get("detail", ""))

    @patch.object(RegisterRateThrottle, "rate", "1/min", create=True)
    def test_register_is_throttled_after_limit(self) -> None:
        payload = {
            "full_name": "First User",
            "email": "first-throttle@example.com",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
            "country": "India",
            "accepted_legal": {
                "terms": "2026-09-18",
                "privacy": "2026-09-18",
            },
        }
        first = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        payload["email"] = "second-throttle@example.com"
        second = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(second.data.get("code"), "throttled")

    def test_invalid_login_returns_friendly_detail(self) -> None:
        response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": "WrongPassword1!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data.get("code"), "authentication_failed")
        self.assertEqual(response.data.get("detail"), "Invalid email or password.")

    def _authenticate_as_attacker(self) -> None:
        access = AuthenticationService.build_tokens(self.user)["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    @patch.object(LoginRateThrottle, "rate", "1/min", create=True)
    def test_login_throttle_applies_with_valid_bearer_token(self) -> None:
        self._authenticate_as_attacker()
        payload = {"email": "victim@example.com", "password": "Guess12345!"}
        first = self.client.post(self.login_url, payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_401_UNAUTHORIZED)

        second = self.client.post(self.login_url, payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @patch.object(RegisterRateThrottle, "rate", "1/min", create=True)
    def test_register_throttle_applies_with_valid_bearer_token(self) -> None:
        self._authenticate_as_attacker()
        first = self.client.post(self.register_url, {}, format="json")
        self.assertEqual(first.status_code, status.HTTP_400_BAD_REQUEST)

        second = self.client.post(self.register_url, {}, format="json")
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @patch.object(PasswordResetRateThrottle, "rate", "1/min", create=True)
    def test_password_reset_throttle_applies_with_valid_bearer_token(self) -> None:
        self._authenticate_as_attacker()
        url = reverse("accounts:password-reset")
        first = self.client.post(url, {"email": "one@example.com"}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.post(url, {"email": "two@example.com"}, format="json")
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @patch.object(PasswordResetEmailRateThrottle, "rate", "1/min", create=True)
    def test_password_reset_email_limit_holds_across_ips(self) -> None:
        url = reverse("accounts:password-reset")
        payload = {"email": self.user.email}
        first = self.client.post(url, payload, format="json", REMOTE_ADDR="198.51.100.1")
        self.assertEqual(first.status_code, status.HTTP_200_OK)

        second = self.client.post(
            url,
            {"email": self.user.email.upper()},
            format="json",
            REMOTE_ADDR="198.51.100.2",
        )
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        other = self.client.post(
            url,
            {"email": "someone-else@example.com"},
            format="json",
            REMOTE_ADDR="198.51.100.3",
        )
        self.assertEqual(other.status_code, status.HTTP_200_OK)

    @patch.object(ChangePasswordRateThrottle, "rate", "1/min", create=True)
    def test_change_password_is_throttled(self) -> None:
        self._authenticate_as_attacker()
        url = reverse("accounts:change-password")
        payload = {
            "current_password": "WrongCurrent1!",
            "new_password": "BrandNewPass123!",
            "new_password_confirm": "BrandNewPass123!",
        }
        first = self.client.post(url, payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_400_BAD_REQUEST)

        second = self.client.post(url, payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "login-lockout-tests",
        }
    },
    LOGIN_LOCKOUT_MAX_FAILURES=3,
)
@patch.object(LoginRateThrottle, "rate", "1000/min", create=True)
class LoginLockoutAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.user = User.objects.create_user(
            email="lockout-user@example.com",
            full_name="Lockout User",
            password=self.password,
            role=Role.objects.get(role_name="Customer"),
            country="India",
            email_verified=True,
        )
        self.login_url = reverse("accounts:login")

    def _login(self, password: str, ip: str):
        return self.client.post(
            self.login_url,
            {"email": self.user.email, "password": password},
            format="json",
            REMOTE_ADDR=ip,
        )

    def test_failures_from_other_clients_do_not_lock_out_owner(self) -> None:
        for index in range(3):
            response = self._login("WrongPassword1!", f"203.0.113.{index + 1}")
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        locked = self._login(self.password, "203.0.113.50")
        self.assertEqual(locked.status_code, status.HTTP_200_OK)

    def test_same_client_is_locked_after_repeated_failures(self) -> None:
        for _ in range(3):
            self._login("WrongPassword1!", "203.0.113.1")
        self.assertEqual(self._login(self.password, "203.0.113.1").status_code, 429)

    def test_successful_login_resets_failure_counter(self) -> None:
        for index in range(2):
            self._login("WrongPassword1!", f"203.0.113.{index + 1}")
        self.assertEqual(
            self._login(self.password, "203.0.113.9").status_code,
            status.HTTP_200_OK,
        )

        for index in range(2):
            response = self._login("WrongPassword1!", f"203.0.113.{index + 20}")
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            self._login(self.password, "203.0.113.30").status_code,
            status.HTTP_200_OK,
        )


class GlobalRateThrottleTests(APITestCase):
    """Each request meets exactly one global limit: ``anon`` by IP, or ``user`` once signed in."""

    def setUp(self) -> None:
        cache.clear()
        self.user = User.objects.create_user(
            email="global-throttle@example.com",
            full_name="Global Throttle",
            password="StrongPass123!",
            role=Role.objects.get(role_name="Customer"),
            country="India",
            email_verified=True,
        )

    def test_anonymous_limit_is_the_stricter_one(self) -> None:
        # Skipping the user limit for anonymous callers is only safe while anon is stricter.
        from django.conf import settings
        from rest_framework.throttling import SimpleRateThrottle

        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        parse = SimpleRateThrottle.parse_rate
        anon_count, anon_seconds = parse(None, rates["anon"])
        user_count, user_seconds = parse(None, rates["user"])
        self.assertLessEqual(anon_count / anon_seconds, user_count / user_seconds)

    def test_anonymous_request_records_only_the_anon_counter(self) -> None:
        response = self.client.get(reverse("categories:category-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(cache.get("throttle_anon_127.0.0.1"))
        self.assertIsNone(cache.get("throttle_user_127.0.0.1"))

    def test_signed_in_request_records_only_the_user_counter(self) -> None:
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("categories:category-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(cache.get("throttle_anon_127.0.0.1"))
        self.assertIsNotNone(cache.get(f"throttle_user_{self.user.pk}"))

    @patch("rest_framework.throttling.AnonRateThrottle.rate", "1/min", create=True)
    def test_anonymous_callers_are_still_limited(self) -> None:
        url = reverse("categories:category-list")
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_429_TOO_MANY_REQUESTS)
