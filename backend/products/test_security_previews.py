"""Public previews must be reduced models and must not sit under guessable keys."""

from __future__ import annotations

import shutil
import tempfile
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role
from categories.models import Category
from config.upload_security import gltf_triangle_count
from products.catalog_import import CatalogImportService
from products.models import Product, ProductFile
from products.services import ProductError, ProductService
from products.test_catalog_import import _happy_item
from products.testing import put_pipeline_images, put_pipeline_packages
from products.testing import make_glb_bytes

User = get_user_model()

SOURCE_KEY = "models/MDL-000142/preview.glb"


class TriangleCountTests(SimpleTestCase):
    def test_counts_each_primitive_mode(self) -> None:
        document = {
            "accessors": [{"count": 30}, {"count": 12}, {"count": 9}],
            "meshes": [
                {"primitives": [{"indices": 0}]},  # 10 triangles
                {"primitives": [{"indices": 1, "mode": 5}]},  # strip: 10
                {"primitives": [{"attributes": {"POSITION": 2}, "mode": 6}]},  # fan: 7
                {"primitives": [{"attributes": {"POSITION": 2}, "mode": 1}]},  # lines: 0
            ],
        }
        self.assertEqual(gltf_triangle_count(document), 27)

    def test_fixture_matches_requested_count(self) -> None:
        from config.upload_security import inspect_product_content

        upload = SimpleUploadedFile("p.glb", make_glb_bytes(250))
        self.assertEqual(inspect_product_content(upload, ".glb"), 250)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class AdminPreviewUploadTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        admin = User.objects.create_user(
            email="preview-admin@example.com",
            full_name="Preview Admin",
            password="StrongPass123!",
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        self.client.force_authenticate(admin)
        category = Category.objects.create(name="Nature", slug="nature")
        self.product = Product.objects.create(
            category=category,
            name="Pine Tree",
            slug="pine-tree",
            price=Decimal("15.00"),
            polygon_count=1000,
            status=Product.Status.DRAFT,
        )
        self.files_url = reverse(
            "products_admin:admin-product-files", kwargs={"product_id": self.product.pk}
        )

    def _upload(self, triangles: int):
        glb = SimpleUploadedFile(
            "preview.glb", make_glb_bytes(triangles), content_type="model/gltf-binary"
        )
        return self.client.post(self.files_url, {"file": glb}, format="multipart")

    def test_full_detail_preview_is_rejected(self) -> None:
        response = self._upload(501)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ProductFile.objects.filter(product=self.product).exists())
        self.product.refresh_from_db()
        self.assertEqual(self.product.preview_model, "")

    def test_reduced_preview_is_stored_with_its_count(self) -> None:
        response = self._upload(500)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.product.refresh_from_db()
        self.assertEqual(self.product.preview_triangle_count, 500)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ApprovePreviewGateTests(TestCase):
    def setUp(self) -> None:
        self.reviewer = User.objects.create_user(
            email="preview-reviewer@example.com",
            full_name="Reviewer",
            password="StrongPass123!",
            role=Role.objects.get(role_name="Administrator"),
            email_verified=True,
        )
        category = Category.objects.create(name="Chairs", slug="chairs")
        self.product = Product.objects.create(
            category=category,
            name="Oak Chair",
            slug="oak-chair",
            sku="MDL-000900",
            price=Decimal("20.00"),
            polygon_count=1000,
            preview_model="https://cdn.example/models/MDL-000900/preview-a.glb",
            preview_triangle_count=400,
            status=Product.Status.PENDING_REVIEW,
        )
        package_key = "models/MDL-000900/package.zip"
        default_storage.save(package_key, ContentFile(b"PK"))
        ProductFile.objects.create(
            product=self.product,
            file_name="package.zip",
            file_format="zip",
            file_size=2,
            storage_path=package_key,
        )

    def _approve_errors(self) -> dict:
        with self.assertRaises(ProductError) as ctx:
            ProductService.approve_product(self.product, reviewer=self.reviewer)
        return ctx.exception.errors or {}

    def test_reduced_preview_is_approved(self) -> None:
        approved = ProductService.approve_product(self.product, reviewer=self.reviewer)
        self.assertEqual(approved.status, Product.Status.PUBLISHED)

    def test_polygon_count_raised_later_is_caught(self) -> None:
        # The preview passed at upload, but the model's count was lowered afterwards.
        Product.objects.filter(pk=self.product.pk).update(polygon_count=600)
        self.assertIn("preview_model", self._approve_errors())

    def test_unmeasured_preview_is_blocked(self) -> None:
        Product.objects.filter(pk=self.product.pk).update(preview_triangle_count=None)
        self.assertIn("preview_model", self._approve_errors())


class ImportPreviewTests(TestCase):
    def setUp(self) -> None:
        # A fresh media root per test: these tests assert which objects exist.
        media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media_root, ignore_errors=True)
        media_override = override_settings(MEDIA_ROOT=media_root)
        media_override.enable()
        self.addCleanup(media_override.disable)
        parent = Category.objects.create(name="Furniture", slug="furniture")
        Category.objects.create(name="Chairs", slug="chairs", parent=parent)
        put_pipeline_packages([_happy_item()])

    def _import(self, item: dict | None = None):
        item = item or _happy_item()
        put_pipeline_images([item])
        batch = CatalogImportService.import_batch(
            import_batch_id="preview-security",
            import_source="catalog-bridge",
            items=[item],
            actor_id="test",
        )
        return batch.results[0]

    def _put_source(self, data: bytes) -> None:
        if default_storage.exists(SOURCE_KEY):
            default_storage.delete(SOURCE_KEY)
        default_storage.save(SOURCE_KEY, ContentFile(data))

    def test_accepted_preview_is_used_in_place(self) -> None:
        self._put_source(make_glb_bytes(100))
        row = self._import()
        self.assertEqual(row.action, "created")
        product = Product.objects.get(sku="MDL-000142")
        self.assertRegex(product.preview_model, r"/media/models/MDL-000142/preview\.glb\?v=[0-9a-f]{12}$")
        self.assertTrue(default_storage.exists(SOURCE_KEY))
        _, files = default_storage.listdir("models/MDL-000142")
        self.assertFalse([name for name in files if name.startswith("preview-")])

    def test_full_detail_preview_is_skipped_and_kept(self) -> None:
        self._put_source(make_glb_bytes(7000))  # happy item has 12480 polygons
        row = self._import()
        self.assertEqual((row.action, row.reason), ("skipped", "preview_not_reduced"))
        self.assertTrue(default_storage.exists(SOURCE_KEY))
        self.assertFalse(Product.objects.filter(sku="MDL-000142").exists())

    def test_invalid_preview_is_skipped_and_kept(self) -> None:
        self._put_source(b"glTF not a model")
        row = self._import()
        self.assertEqual((row.action, row.reason), ("skipped", "invalid_preview"))
        self.assertTrue(default_storage.exists(SOURCE_KEY))

    @patch("products.catalog_import.PRODUCT_PREVIEW_MAX_BYTES", 10)
    def test_too_large_preview_is_skipped_and_kept(self) -> None:
        self._put_source(make_glb_bytes(100))
        row = self._import()
        self.assertEqual((row.action, row.reason), ("skipped", "preview_too_large"))
        self.assertTrue(default_storage.exists(SOURCE_KEY))

    @override_settings(PACKAGE_SCAN_HOST="clamav", PACKAGE_SCAN_PORT=3310)
    def test_infected_preview_is_skipped_and_deleted(self) -> None:
        self._put_source(make_glb_bytes(100))
        with patch("config.upload_security.socket.create_connection") as connect:
            connect.return_value.__enter__.return_value.recv.side_effect = [
                b"stream: Eicar-Signature FOUND\0"
            ]
            row = self._import()
        self.assertEqual((row.action, row.reason), ("skipped", "preview_malware"))
        self.assertFalse(default_storage.exists(SOURCE_KEY))

    @override_settings(PACKAGE_SCAN_REQUIRED=True, PACKAGE_SCAN_HOST="")
    def test_preview_is_kept_when_the_scanner_is_unavailable(self) -> None:
        self._put_source(make_glb_bytes(100))
        row = self._import()
        self.assertEqual((row.action, row.reason), ("skipped", "scanner_unavailable"))
        self.assertTrue(default_storage.exists(SOURCE_KEY))

    def test_missing_preview_object_is_skipped(self) -> None:
        row = self._import()
        self.assertEqual((row.action, row.reason), ("skipped", "missing_preview_object"))

    def test_non_glb_preview_is_skipped(self) -> None:
        item = _happy_item()
        item["media"]["preview_key"] = "models/MDL-000142/preview.gltf"
        row = self._import(item)
        self.assertEqual((row.action, row.reason), ("skipped", "invalid_preview_format"))

    def test_reimport_deletes_old_random_preview_copy(self) -> None:
        self._put_source(make_glb_bytes(100))
        self._import()
        # The product still points at a random copy an older import made.
        old_key = "models/MDL-000142/preview-" + "c" * 32 + ".glb"
        default_storage.save(old_key, ContentFile(make_glb_bytes(100)))
        Product.objects.filter(sku="MDL-000142").update(
            preview_model=f"http://testserver/media/{old_key}"
        )

        self._put_source(make_glb_bytes(200))
        row = self._import()
        self.assertEqual(row.action, "updated")
        product = Product.objects.get(sku="MDL-000142")
        self.assertRegex(product.preview_model, r"/models/MDL-000142/preview\.glb\?v=")
        self.assertEqual(product.preview_triangle_count, 200)
        self.assertFalse(default_storage.exists(old_key))
        self.assertTrue(default_storage.exists(SOURCE_KEY))

    def test_changed_preview_gets_a_new_url(self) -> None:
        self._put_source(make_glb_bytes(100))
        self._import()
        first = Product.objects.get(sku="MDL-000142").preview_model

        self._put_source(make_glb_bytes(200))
        self._import()
        self.assertNotEqual(Product.objects.get(sku="MDL-000142").preview_model, first)

    def test_reimport_without_new_upload_keeps_the_preview(self) -> None:
        self._put_source(make_glb_bytes(100))
        self._import()
        first = Product.objects.get(sku="MDL-000142").preview_model
        default_storage.delete(SOURCE_KEY)

        row = self._import()
        self.assertEqual(row.action, "updated")
        product = Product.objects.get(sku="MDL-000142")
        self.assertEqual(product.preview_model, first)
        self.assertEqual(product.preview_triangle_count, 100)
