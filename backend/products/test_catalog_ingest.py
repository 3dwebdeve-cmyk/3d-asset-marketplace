"""Catalog uploader exe: POST /api/v1/catalog-ingest/import/ with an API key."""

from __future__ import annotations

import tempfile

from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.api_keys import CatalogApiKeyService
from accounts.models import ActivityLog, CatalogApiKey, Role, User
from categories.models import Category
from products.models import Product
from products.test_catalog_import import _pipeline_item
from products.testing import put_pipeline_objects


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class CatalogIngestAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        furniture = Category.objects.create(name="Furniture", slug="furniture")
        Category.objects.create(name="Chairs", slug="chairs", parent=furniture)
        self.issued = CatalogApiKeyService.create_key(name="office-pc")
        self.url = reverse("catalog_ingest:import")
        self.admin_import_url = reverse("products_admin:admin-catalog-import")

        self.password = "StrongPass123!"
        self.admin = User.objects.create_user(
            email="ingest-admin@example.com",
            full_name="Ingest Admin",
            password=self.password,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )

    def _envelope(self, sku: str = "FUR-CHR-000123") -> dict:
        item = _pipeline_item(sku)
        put_pipeline_objects([item])
        return {"import_batch_id": f"exe-{sku}", "import_source": "3dsmax-uploader", "items": [item]}

    def _post(self, url: str, *, auth: str | None, sku: str = "FUR-CHR-000123", **extra):
        if auth is None:
            self.client.credentials()
        else:
            self.client.credentials(HTTP_AUTHORIZATION=auth)
        return self.client.post(url, self._envelope(sku), format="json", **extra)

    def _key_header(self, key: str | None = None) -> str:
        return f"Api-Key {key or self.issued.key}"

    def test_valid_key_imports_as_service_user(self) -> None:
        response = self._post(self.url, auth=self._key_header())

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["results"][0]["status"], "pending_review")
        product = Product.objects.get(sku="FUR-CHR-000123")
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
        self.assertEqual(product.import_source, "3dsmax-uploader")

        api_key = CatalogApiKey.objects.get(pk=self.issued.api_key.pk)
        self.assertIsNotNone(api_key.last_used_at)

        log = ActivityLog.objects.get(action="catalog_ingest_import")
        self.assertEqual(log.actor_id, api_key.user_id)
        self.assertEqual(log.target_id, "exe-FUR-CHR-000123")
        self.assertEqual(log.metadata["key_prefix"], api_key.key_prefix)
        self.assertEqual(log.metadata["created"], 1)
        self.assertNotIn(self.issued.key, str(log.metadata))

    def test_missing_wrong_or_malformed_key_is_rejected(self) -> None:
        prefix = self.issued.api_key.key_prefix
        for header in (
            None,
            "Api-Key",
            "Api-Key a b",
            "Api-Key not-a-key",
            f"Api-Key {prefix}.wrong-secret",
            "Api-Key 00000000.unknown-prefix",
            f"Bearer {self.issued.key}",
        ):
            with self.subTest(header=header):
                response = self._post(self.url, auth=header)
                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(Product.objects.exists())

    def test_revoked_key_is_rejected(self) -> None:
        CatalogApiKeyService.revoke(self.issued.api_key.key_prefix)
        response = self._post(self.url, auth=self._key_header())
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_inactive_key_is_rejected(self) -> None:
        CatalogApiKey.objects.filter(pk=self.issued.api_key.pk).update(is_active=False)
        response = self._post(self.url, auth=self._key_header())
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_key_bound_to_a_non_uploader_user_is_rejected(self) -> None:
        CatalogApiKey.objects.filter(pk=self.issued.api_key.pk).update(user=self.admin)
        response = self._post(self.url, auth=self._key_header())
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_key_does_not_work_on_other_endpoints(self) -> None:
        response = self._post(self.admin_import_url, auth=self._key_header())
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(Product.objects.exists())

        for name in ("accounts:me", "accounts:admin-me", "accounts:admin-users"):
            with self.subTest(name=name):
                response = self.client.get(reverse(name))
                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_jwt_without_key_is_rejected(self) -> None:
        login = self.client.post(
            reverse("accounts:admin-login"),
            {"email": self.admin.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        response = self._post(self.url, auth=f"Bearer {login.data['access']}")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(Product.objects.exists())

    @override_settings(CATALOG_INGEST_ALLOWED_IPS=["203.0.113.0/24"])
    def test_optional_ip_allowlist(self) -> None:
        blocked = self._post(self.url, auth=self._key_header(), REMOTE_ADDR="198.51.100.7")
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Product.objects.exists())

        allowed = self._post(self.url, auth=self._key_header(), REMOTE_ADDR="203.0.113.9")
        self.assertEqual(allowed.status_code, status.HTTP_200_OK, allowed.data)

    def test_route_is_outside_the_admin_ip_lock(self) -> None:
        with override_settings(ADMIN_CONSOLE_ALLOWED_IPS=["203.0.113.0/24"]):
            admin_route = self._post(
                self.admin_import_url, auth=self._key_header(), REMOTE_ADDR="198.51.100.7"
            )
            ingest = self._post(self.url, auth=self._key_header(), REMOTE_ADDR="198.51.100.7")
        self.assertEqual(admin_route.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(ingest.status_code, status.HTTP_200_OK, ingest.data)

    def test_has_its_own_throttle_scope(self) -> None:
        from django.conf import settings

        from products.views import CatalogIngestImportView

        scopes = [throttle.scope for throttle in CatalogIngestImportView.throttle_classes]
        self.assertEqual(scopes, ["catalog_ingest"])
        self.assertEqual(settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["catalog_ingest"], "30/min")
