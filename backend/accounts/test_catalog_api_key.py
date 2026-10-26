"""Catalog uploader API keys: storage, service user, management command."""

from __future__ import annotations

import hashlib
import re
from io import StringIO

from django.conf import settings
from django.core.cache import cache
from django.core.management import CommandError, call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.api_keys import (
    CATALOG_UPLOADER_ROLE,
    DEFAULT_SERVICE_EMAIL,
    CatalogApiKeyError,
    CatalogApiKeyService,
)
from accounts.models import CatalogApiKey, Role, User
from accounts.services import AuthenticationService


class CatalogApiKeyServiceTests(TestCase):
    def test_role_is_seeded_by_migration(self) -> None:
        self.assertTrue(Role.objects.filter(role_name=CATALOG_UPLOADER_ROLE).exists())

    def test_plain_key_is_never_stored(self) -> None:
        issued = CatalogApiKeyService.create_key(name="office-pc")
        row = CatalogApiKey.objects.get(pk=issued.api_key.pk)

        self.assertEqual(row.key_hash, hashlib.sha256(issued.key.encode()).hexdigest())
        self.assertTrue(issued.key.startswith(f"{row.key_prefix}."))
        self.assertEqual(len(row.key_prefix), 8)
        secret = issued.key.split(".", 1)[1]
        for value in (row.name, row.key_prefix, row.key_hash):
            self.assertNotIn(secret, value)

    def test_verify_accepts_only_the_exact_active_key(self) -> None:
        issued = CatalogApiKeyService.create_key(name="office-pc")
        self.assertEqual(CatalogApiKeyService.verify(issued.key), issued.api_key)
        self.assertIsNone(CatalogApiKeyService.verify(issued.key + "x"))
        self.assertIsNone(CatalogApiKeyService.verify(issued.key.split(".", 1)[1]))

        CatalogApiKeyService.revoke(issued.api_key.key_prefix)
        self.assertIsNone(CatalogApiKeyService.verify(issued.key))
        row = CatalogApiKey.objects.get(pk=issued.api_key.pk)
        self.assertFalse(row.is_active)
        self.assertIsNotNone(row.revoked_at)

    def test_service_user_is_not_an_administrator_and_cannot_sign_in(self) -> None:
        issued = CatalogApiKeyService.create_key(name="office-pc")
        user = issued.api_key.user

        self.assertEqual(user.email, DEFAULT_SERVICE_EMAIL)
        self.assertEqual(user.role.role_name, CATALOG_UPLOADER_ROLE)
        self.assertFalse(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.has_usable_password())
        self.assertFalse(AuthenticationService.is_administrator(user))

        cache.clear()
        client = APIClient()
        for name in ("accounts:login", "accounts:admin-login"):
            with self.subTest(name=name):
                response = client.post(
                    reverse(name),
                    {"email": user.email, "password": "anything-at-all-123"},
                    format="json",
                )
                self.assertNotEqual(response.status_code, status.HTTP_200_OK)
                self.assertNotIn("access", response.data)

    def test_keys_share_one_service_user(self) -> None:
        first = CatalogApiKeyService.create_key(name="office-pc")
        second = CatalogApiKeyService.create_key(name="laptop")
        self.assertEqual(first.api_key.user_id, second.api_key.user_id)
        self.assertNotEqual(first.api_key.key_prefix, second.api_key.key_prefix)

    def test_refuses_to_reuse_a_customer_or_admin_email(self) -> None:
        User.objects.create_user(
            email="ops@example.com",
            full_name="Ops",
            password="StrongPass123!",
            role=Role.objects.get(role_name="Administrator"),
        )
        with self.assertRaises(CatalogApiKeyError):
            CatalogApiKeyService.create_key(name="office-pc", service_email="ops@example.com")
        self.assertFalse(CatalogApiKey.objects.exists())

    def test_key_auth_is_not_a_default_authenticator(self) -> None:
        self.assertNotIn(
            "accounts.authentication.CatalogApiKeyAuthentication",
            settings.REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"],
        )


class CatalogApiKeyCommandTests(TestCase):
    def _call(self, *args: str) -> str:
        out = StringIO()
        call_command("catalog_api_key", *args, stdout=out)
        return out.getvalue()

    def test_create_list_revoke(self) -> None:
        created = self._call("create", "--name", "office-pc")
        key = re.search(r"^([0-9a-f]{8}\.\S+)$", created, re.MULTILINE).group(1)
        prefix = key.split(".", 1)[0]
        self.assertIsNotNone(CatalogApiKeyService.verify(key))

        listed = self._call("list")
        self.assertIn(prefix, listed)
        self.assertIn("active", listed)
        self.assertIn("office-pc", listed)
        self.assertNotIn(key, listed)

        revoked = self._call("revoke", "--prefix", prefix)
        self.assertIn(prefix, revoked)
        self.assertIsNone(CatalogApiKeyService.verify(key))
        self.assertIn("revoked", self._call("list"))

    def test_revoke_unknown_prefix_fails(self) -> None:
        with self.assertRaises(CommandError):
            self._call("revoke", "--prefix", "deadbeef")
