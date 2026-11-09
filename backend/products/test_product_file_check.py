"""The console's file check: is every file a product uses really in storage?"""

from __future__ import annotations

from unittest.mock import patch

from django.core.files.storage import default_storage
from django.urls import reverse
from rest_framework import status

from products.file_check import EXTERNAL, FOUND, MISSING, UNKNOWN
from products.models import Product, ProductImage
from products.test_catalog_import import CatalogImportTestBase, _happy_item


class _BrokenStorage:
    """A storage that never answers, like R2 during an outage."""

    def exists(self, name: str) -> bool:
        raise OSError("storage unavailable")


class ProductFileCheckTests(CatalogImportTestBase):
    def setUp(self) -> None:
        super().setUp()
        self._authenticate_as_admin()
        response = self._post_batch([_happy_item()])
        self.assertEqual(response.data["created"], 1, response.data)
        self.product = Product.objects.get(sku="MDL-000142")
        self.url = reverse("products_admin:admin-product-file-check", kwargs={"product_id": self.product.pk})

    def _check(self) -> dict:
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def _by_key(self, data: dict) -> dict[str, dict]:
        return {row["key"]: row for row in data["files"]}

    def test_every_file_found_after_a_complete_upload(self) -> None:
        data = self._check()

        self.assertEqual(data["missing"], 0)
        self.assertEqual(data["unknown"], 0)
        roles = {row["role"] for row in data["files"]}
        self.assertTrue({"thumbnail", "preview", "image", "package"} <= roles, roles)
        self.assertTrue(all(row["status"] == FOUND for row in data["files"]), data["files"])

    def test_a_render_deleted_from_storage_is_reported_missing(self) -> None:
        default_storage.delete("models/MDL-000142/gallery/01.jpg")

        data = self._check()

        self.assertEqual(data["missing"], 1)
        row = self._by_key(data)["models/MDL-000142/gallery/01.jpg"]
        self.assertEqual(row["status"], MISSING)
        self.assertEqual(row["bucket"], "public")
        self.assertEqual(row["role"], "image")

    def test_a_missing_package_is_reported_from_the_private_bucket(self) -> None:
        default_storage.delete("models/MDL-000142/package.zip")

        data = self._check()

        row = self._by_key(data)["models/MDL-000142/package.zip"]
        self.assertEqual(row["status"], MISSING)
        self.assertEqual(row["bucket"], "private")
        self.assertEqual(row["role"], "package")
        self.assertIn("Download (", row["label"])

    def test_an_image_on_another_host_is_not_counted_missing(self) -> None:
        ProductImage.objects.create(
            product=self.product, image_url="https://images.example.com/chair.jpg", display_order=9
        )

        data = self._check()

        self.assertEqual(data["missing"], 0)
        self.assertEqual(self._by_key(data)["https://images.example.com/chair.jpg"]["status"], EXTERNAL)

    def test_storage_outage_reports_unknown_not_missing(self) -> None:
        with patch("products.file_check.get_public_storage", return_value=_BrokenStorage()):
            data = self._check()

        self.assertEqual(data["missing"], 0)
        self.assertGreater(data["unknown"], 0)
        self.assertEqual(self._by_key(data)["models/MDL-000142/thumbnail.jpg"]["status"], UNKNOWN)

    def test_administrators_only(self) -> None:
        self.client.credentials()
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_401_UNAUTHORIZED)

        login = self.client.post(
            reverse("accounts:login"),
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)

    def test_unknown_product_is_404(self) -> None:
        url = reverse(
            "products_admin:admin-product-file-check",
            kwargs={"product_id": "00000000-0000-0000-0000-000000000000"},
        )
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
