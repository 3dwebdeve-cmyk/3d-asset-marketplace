"""3ds Max pipeline end to end, and subcategory products under their parent."""

from __future__ import annotations

import tempfile
from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.api_keys import CatalogApiKeyService
from accounts.models import Role, User
from categories.models import Category
from config.storages import signed_url_expiry_seconds
from orders.models import Order, OrderItem
from products.models import Product, ProductFile
from products.test_catalog_import import _pipeline_item
from products.testing import put_pipeline_objects

SKU = "FUR-CHR-000123"


class PublicCategoryFilterTests(APITestCase):
    """A parent lists its active subcategories' products; a subcategory only its own."""

    def setUp(self) -> None:
        cache.clear()
        self.furniture = Category.objects.create(name="Furniture", slug="furniture")
        self.chairs = Category.objects.create(name="Chairs", slug="chairs", parent=self.furniture)
        self.retired = Category.objects.create(
            name="Retired", slug="retired", parent=self.furniture, is_active=False
        )
        self.lights = Category.objects.create(name="Lights", slug="lights")
        for name, category in (
            ("Sofa", self.furniture),
            ("Oak Chair", self.chairs),
            ("Old Stool", self.retired),
            ("Lamp", self.lights),
        ):
            Product.objects.create(
                category=category,
                name=name,
                slug=name.lower().replace(" ", "-"),
                price=Decimal("10.00"),
                status=Product.Status.PUBLISHED,
            )
        self.url = reverse("products:product-list")

    def _slugs(self, category: Category) -> set[str]:
        response = self.client.get(self.url, {"category_id": str(category.pk)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return {row["slug"] for row in response.data["results"]}

    def test_parent_includes_active_subcategories(self) -> None:
        self.assertEqual(self._slugs(self.furniture), {"sofa", "oak-chair"})

    def test_subcategory_lists_only_itself(self) -> None:
        self.assertEqual(self._slugs(self.chairs), {"oak-chair"})

    def test_inactive_subcategory_is_excluded(self) -> None:
        self.assertNotIn("old-stool", self._slugs(self.furniture))
        self.assertEqual(self._slugs(self.retired), set())

    def test_unrelated_category_is_unchanged(self) -> None:
        self.assertEqual(self._slugs(self.lights), {"lamp"})


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PipelineEndToEndTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.furniture = Category.objects.create(name="Furniture", slug="furniture")
        self.chairs = Category.objects.create(name="Chairs", slug="chairs", parent=self.furniture)
        self.password = "StrongPass123!"
        self.admin = User.objects.create_user(
            email="pipeline-admin@example.com",
            full_name="Pipeline Admin",
            password=self.password,
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        self.buyer = User.objects.create_user(
            email="pipeline-buyer@example.com",
            full_name="Pipeline Buyer",
            password=self.password,
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )

    def _login(self, url_name: str, user: User) -> None:
        response = self.client.post(
            reverse(url_name), {"email": user.email, "password": self.password}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _public_slugs(self, category: Category) -> dict[str, dict]:
        self.client.credentials()
        response = self.client.get(
            reverse("products:product-list"), {"category_id": str(category.pk)}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return {row["slug"]: row for row in response.data["results"]}

    def test_api_key_import_to_approved_signed_download(self) -> None:
        # 1. The uploader exe imports with its API key and the plugin's file names.
        issued = CatalogApiKeyService.create_key(name="office-pc")
        item = _pipeline_item(SKU, subcategory="Chairs", package_formats=["max", "fbx"])
        put_pipeline_objects([item])
        self.client.credentials(HTTP_AUTHORIZATION=f"Api-Key {issued.key}")
        imported = self.client.post(
            reverse("catalog_ingest:import"),
            {"import_batch_id": "exe-run-01", "import_source": "3dsmax-uploader", "items": [item]},
            format="json",
        )
        self.assertEqual(imported.status_code, status.HTTP_200_OK, imported.data)
        self.assertEqual(imported.data["created"], 1, imported.data)
        self.assertNotIn("warnings", imported.data["results"][0])

        product = Product.objects.get(sku=SKU)
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
        self.assertEqual(product.category_id, self.chairs.pk)
        package = ProductFile.objects.get(product=product, is_preview=False)
        self.assertEqual(package.storage_path, f"models/{SKU}/{SKU}.zip")
        self.assertEqual(package.file_name, f"{SKU}.zip")
        self.assertNotIn(product.slug, self._public_slugs(self.furniture))

        # 2. An administrator approves it in /console.
        self._login("accounts:admin-login", self.admin)
        approve = self.client.post(
            reverse("products_admin:admin-product-approve", kwargs={"product_id": product.pk}),
            {},
            format="json",
        )
        self.assertEqual(approve.status_code, status.HTTP_200_OK, approve.data)
        self.assertEqual(approve.data["status"], "published")

        # 3. It is listed under its subcategory and its parent, with the package formats.
        for category in (self.chairs, self.furniture):
            with self.subTest(category=category.name):
                rows = self._public_slugs(category)
                self.assertIn(product.slug, rows)
                self.assertEqual(rows[product.slug]["formats"], ["fbx", "max"])

        # 4. A buyer who owns it gets a short-lived signed URL named after the ID.
        order = Order.objects.create(
            user=self.buyer,
            invoice_number="INV-PIPE-00001",
            total_amount=product.price,
            currency=product.currency,
            order_status=Order.OrderStatus.PAID,
            payment_status=Order.PaymentStatus.PAID,
        )
        OrderItem.objects.create(
            order=order,
            product_type=OrderItem.ProductType.PRODUCT,
            product_id=product.pk,
            title=product.name,
            slug=product.slug,
            quantity=1,
            purchase_price=product.price,
        )
        self._login("accounts:login", self.buyer)
        download_url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": product.pk, "file_id": package.pk},
        )
        with (
            patch("config.media.private_r2_object_exists", return_value=True) as exists,
            patch(
                "config.media.generate_private_presigned_url",
                return_value="https://r2.example/signed",
            ) as presign,
        ):
            download = self.client.get(download_url)

        self.assertEqual(download.status_code, status.HTTP_200_OK)
        exists.assert_called_once_with(f"models/{SKU}/{SKU}.zip")
        presign.assert_called_once_with(f"models/{SKU}/{SKU}.zip", file_name=f"{SKU}.zip")
        self.assertEqual(download.data["download_url"], "https://r2.example/signed")
        self.assertEqual(download.data["file_name"], f"{SKU}.zip")
        self.assertEqual(download.data["expires_in"], signed_url_expiry_seconds())
