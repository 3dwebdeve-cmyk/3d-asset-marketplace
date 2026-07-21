from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from accounts.throttles import LoginRateThrottle, RegisterRateThrottle


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
