import warnings

import jwt
from django.conf import settings
from django.test import SimpleTestCase, TestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Role, User


class SecretKeySecurityTests(SimpleTestCase):
    def test_secret_key_meets_hs256_minimum_length(self) -> None:
        key_bytes = settings.SECRET_KEY.encode("utf-8")
        self.assertGreaterEqual(
            len(key_bytes),
            32,
            "SECRET_KEY must be at least 32 bytes for HS256 (RFC 7518).",
        )

    def test_jwt_encode_does_not_warn_about_insecure_key_length(self) -> None:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            jwt.encode({"sub": "test"}, settings.SECRET_KEY, algorithm="HS256")

        insecure_warnings = [
            warning
            for warning in caught
            if warning.category.__name__ == "InsecureKeyLengthWarning"
        ]
        self.assertEqual(
            insecure_warnings,
            [],
            "HMAC signing key is too short for SHA-256.",
        )


class JwtSigningIntegrationTests(TestCase):
    def test_token_signing_has_no_insecure_key_warning(self) -> None:
        role = Role.objects.get(role_name="Customer")
        user = User.objects.create_user(
            email="hmac-key@example.com",
            full_name="HMAC Key User",
            password="StrongPass123!",
            role=role,
            country="India",
        )

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            RefreshToken.for_user(user)

        insecure_warnings = [
            warning
            for warning in caught
            if warning.category.__name__ == "InsecureKeyLengthWarning"
        ]
        self.assertEqual(insecure_warnings, [])
