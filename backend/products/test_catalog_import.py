"""Feature 16 Phase 6 — Catalog Import API tests."""

from __future__ import annotations

import tempfile
from decimal import Decimal
from io import BytesIO

from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category
from products.models import Product, ProductFile, ProductImage
from products.testing import put_pipeline_uploads

_HAPPY_CHECKSUM = "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"


def _happy_item(**overrides: object) -> dict:
    item: dict = {
        "model_id": "MDL-000142",
        "name": "Studio Chair Oak",
        "category": "Furniture",
        "subcategory": "Chairs",
        "price": "29.99",
        "currency": "USD",
        "discount_price": None,
        "short_description": "Oak studio chair with fabric seat",
        "description": "High-quality chair model for archviz and games.",
        "license_type": "standard",
        "rigged": False,
        "animated": False,
        "pbr_ready": True,
        "game_ready": True,
        "software_used": "3ds Max 2024",
        "polygon_count": 12480,
        "glb_checksum": _HAPPY_CHECKSUM,
        "qa_status": "Ready for QA",
        "folder_match_status": "Matched",
        "r2_key_prefix": "models/MDL-000142/",
        "exports": {
            "glb": "Success",
            "fbx": "Success",
            "obj": "Skipped",
            "gltf": "Skipped",
            "max": "Skipped",
            "glb_size": "4.2",
            "fbx_size": "18.4",
        },
        "media": {
            "thumbnail_key": "models/MDL-000142/thumbnail.jpg",
            "preview_key": "models/MDL-000142/preview.glb",
            "package_key": "models/MDL-000142/package.zip",
            "package_file_name": "package.zip",
            "package_file_format": "zip",
            "package_file_size": 1048576,
            "gallery_keys": ["models/MDL-000142/gallery/01.jpg"],
        },
    }
    item.update(overrides)
    return item


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class CatalogImportTestBase(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"

        self.admin_user = User.objects.create_user(
            email="catalog-import-admin@example.com",
            full_name="Catalog Import Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])

        self.customer_user = User.objects.create_user(
            email="catalog-import-customer@example.com",
            full_name="Catalog Import Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )

        self.furniture = Category.objects.create(name="Furniture", slug="furniture")
        self.chairs = Category.objects.create(
            name="Chairs",
            slug="chairs",
            parent=self.furniture,
        )
        self.import_url = reverse("products_admin:admin-catalog-import")
        self.public_list_url = reverse("products:product-list")
        self.admin_login_url = reverse("accounts:admin-login")

    def _authenticate_as_admin(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _post_batch(self, items: list[dict], *, batch_id: str = "2026-09-03-run-01"):
        put_pipeline_uploads(items)
        return self.client.post(
            self.import_url,
            {
                "import_batch_id": batch_id,
                "import_source": "catalog-bridge",
                "items": items,
            },
            format="json",
        )


class CatalogImportAPITests(CatalogImportTestBase):
    def test_import_requires_administrator(self) -> None:
        response = self._post_batch([_happy_item()])
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        login = self.client.post(
            reverse("accounts:login"),
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        response = self._post_batch([_happy_item()])
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_happy_path_creates_pending_review(self) -> None:
        self._authenticate_as_admin()
        response = self._post_batch([_happy_item()])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created"], 1)
        self.assertEqual(response.data["updated"], 0)
        self.assertEqual(response.data["skipped"], 0)
        self.assertEqual(response.data["failed"], 0)
        self.assertEqual(response.data["results"][0]["action"], "created")
        self.assertEqual(response.data["results"][0]["status"], "pending_review")

        product = Product.objects.get(sku="MDL-000142")
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
        self.assertEqual(product.name, "Studio Chair Oak")
        self.assertEqual(product.category_id, self.chairs.pk)
        self.assertEqual(product.price, Decimal("29.99"))
        self.assertEqual(product.import_batch_id, "2026-09-03-run-01")
        self.assertEqual(product.import_source, "catalog-bridge")
        self.assertEqual(product.glb_checksum, _HAPPY_CHECKSUM.lower())
        self.assertTrue(product.has_thumbnail)
        self.assertTrue(product.has_preview)
        self.assertTrue(product.has_package)
        self.assertRegex(product.thumbnail, r"models/MDL-000142/thumbnail-[0-9a-f]{12}\.webp$")
        # The predictable pipeline name is replaced by an unguessable one.
        self.assertRegex(product.preview_model, r"models/MDL-000142/preview-[0-9a-f]{32}\.glb$")
        self.assertFalse(default_storage.exists("models/MDL-000142/preview.glb"))
        self.assertEqual(product.preview_triangle_count, 100)
        self.assertNotIn("package.zip", product.thumbnail)
        self.assertNotIn("package.zip", product.preview_model)

        package = ProductFile.objects.get(product=product, is_preview=False)
        self.assertEqual(package.storage_path, "models/MDL-000142/package.zip")
        self.assertFalse(package.is_preview)

        gallery = list(ProductImage.objects.filter(product=product))
        self.assertEqual(len(gallery), 1)
        self.assertRegex(gallery[0].image_url, r"models/MDL-000142/gallery/01-[0-9a-f]{12}\.webp$")

    def test_reimport_updates_idempotently(self) -> None:
        self._authenticate_as_admin()
        first = self._post_batch([_happy_item()])
        self.assertEqual(first.data["created"], 1)

        second = self._post_batch(
            [_happy_item(name="Studio Chair Oak v2", price="34.99")],
            batch_id="2026-09-03-run-02",
        )
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data["created"], 0)
        self.assertEqual(second.data["updated"], 1)
        self.assertEqual(second.data["results"][0]["action"], "updated")
        self.assertEqual(second.data["results"][0]["status"], "pending_review")

        self.assertEqual(Product.objects.filter(sku="MDL-000142").count(), 1)
        product = Product.objects.get(sku="MDL-000142")
        self.assertEqual(product.name, "Studio Chair Oak v2")
        self.assertEqual(product.price, Decimal("34.99"))
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
        self.assertEqual(product.import_batch_id, "2026-09-03-run-02")
        self.assertEqual(
            ProductFile.objects.filter(product=product, is_preview=False).count(),
            1,
        )

    def test_skip_folder_mismatch(self) -> None:
        self._authenticate_as_admin()
        response = self._post_batch(
            [
                _happy_item(
                    model_id="MDL-000199",
                    r2_key_prefix="models/MDL-000199/",
                    folder_match_status="Mismatch",
                    media={
                        "thumbnail_key": "models/MDL-000199/thumbnail.jpg",
                        "preview_key": "models/MDL-000199/preview.glb",
                        "package_key": "models/MDL-000199/package.zip",
                        "package_file_size": 100,
                    },
                )
            ]
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["skipped"], 1)
        self.assertEqual(response.data["results"][0]["reason"], "folder_mismatch")
        self.assertFalse(Product.objects.filter(sku="MDL-000199").exists())

    def test_skip_gate_failures(self) -> None:
        self._authenticate_as_admin()
        items = [
            _happy_item(
                model_id="MDL-000201",
                r2_key_prefix="models/MDL-000201/",
                exports={
                    "glb": "Success",
                    "fbx": "Skipped",
                    "obj": "Skipped",
                    "gltf": "Skipped",
                    "max": "Skipped",
                },
                media={
                    "thumbnail_key": "models/MDL-000201/thumbnail.jpg",
                    "preview_key": "models/MDL-000201/preview.glb",
                    "package_key": "models/MDL-000201/package.zip",
                    "package_file_size": 100,
                },
            ),
            _happy_item(
                model_id="MDL-000202",
                r2_key_prefix="models/MDL-000202/",
                price=None,
                media={
                    "thumbnail_key": "models/MDL-000202/thumbnail.jpg",
                    "preview_key": "models/MDL-000202/preview.glb",
                    "package_key": "models/MDL-000202/package.zip",
                    "package_file_size": 100,
                },
            ),
            _happy_item(
                model_id="MDL-000203",
                r2_key_prefix="models/MDL-000203/",
                media={
                    "thumbnail_key": "",
                    "preview_key": "models/MDL-000203/preview.glb",
                    "package_key": "models/MDL-000203/package.zip",
                    "package_file_size": 100,
                },
            ),
        ]
        response = self._post_batch(items)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["skipped"], 3)
        reasons = {row["model_id"]: row["reason"] for row in response.data["results"]}
        self.assertEqual(reasons["MDL-000201"], "exports_incomplete")
        self.assertEqual(reasons["MDL-000202"], "invalid_price")
        self.assertEqual(reasons["MDL-000203"], "missing_thumbnail")
        self.assertEqual(Product.objects.filter(sku__startswith="MDL-00020").count(), 0)

    def test_skip_published_and_archived(self) -> None:
        self._authenticate_as_admin()
        Product.objects.create(
            category=self.furniture,
            name="Live Chair",
            slug="live-chair",
            sku="MDL-000142",
            price=Decimal("10.00"),
            status=Product.Status.PUBLISHED,
        )
        Product.objects.create(
            category=self.furniture,
            name="Old Chair",
            slug="old-chair",
            sku="MDL-000300",
            price=Decimal("10.00"),
            status=Product.Status.ARCHIVED,
        )

        response = self._post_batch(
            [
                _happy_item(),
                _happy_item(
                    model_id="MDL-000300",
                    r2_key_prefix="models/MDL-000300/",
                    media={
                        "thumbnail_key": "models/MDL-000300/thumbnail.jpg",
                        "preview_key": "models/MDL-000300/preview.glb",
                        "package_key": "models/MDL-000300/package.zip",
                        "package_file_size": 100,
                    },
                ),
            ]
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["skipped"], 2)
        reasons = {row["model_id"]: row["reason"] for row in response.data["results"]}
        self.assertEqual(reasons["MDL-000142"], "published_sku")
        self.assertEqual(reasons["MDL-000300"], "archived_sku")
        self.assertEqual(
            Product.objects.get(sku="MDL-000142").status,
            Product.Status.PUBLISHED,
        )

    def test_skip_category_unmapped(self) -> None:
        self._authenticate_as_admin()
        response = self._post_batch([_happy_item(category="DoesNotExist")])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["skipped"], 1)
        self.assertEqual(response.data["results"][0]["reason"], "category_unmapped")

    def test_invalid_envelope_returns_400(self) -> None:
        self._authenticate_as_admin()
        response = self.client.post(
            self.import_url,
            {"import_batch_id": "x", "items": []},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            self.import_url,
            {"items": [_happy_item()]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pending_review_excluded_from_public_list(self) -> None:
        self._authenticate_as_admin()
        self._post_batch([_happy_item()])
        self.client.credentials()

        response = self.client.get(self.public_list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        slugs = [row["slug"] for row in response.data["results"]]
        self.assertNotIn("studio-chair-oak", slugs)

    def test_never_auto_publishes(self) -> None:
        self._authenticate_as_admin()
        response = self._post_batch([_happy_item()])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product = Product.objects.get(sku="MDL-000142")
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
        self.assertNotEqual(product.status, Product.Status.PUBLISHED)

    def test_path_traversal_object_key_skipped(self) -> None:
        self._authenticate_as_admin()
        response = self._post_batch(
            [
                _happy_item(
                    media={
                        "thumbnail_key": "models/MDL-000142/../secret.jpg",
                        "preview_key": "models/MDL-000142/preview.glb",
                        "package_key": "models/MDL-000142/package.zip",
                        "package_file_size": 100,
                    }
                )
            ]
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["skipped"], 1)
        self.assertEqual(response.data["results"][0]["reason"], "invalid_object_key")

    def test_package_key_must_be_package_zip(self) -> None:
        # Only package.zip and <sku>.zip are packages; other names are rejected.
        self._authenticate_as_admin()
        for key in ("models/MDL-000142/source.rar", "models/MDL-000142/gallery/package.zip"):
            with self.subTest(key=key):
                response = self._post_batch(
                    [
                        _happy_item(
                            media={
                                "thumbnail_key": "models/MDL-000142/thumbnail.jpg",
                                "preview_key": "models/MDL-000142/preview.glb",
                                "package_key": key,
                                "package_file_size": 100,
                            }
                        )
                    ]
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data["skipped"], 1)
                self.assertEqual(response.data["results"][0]["reason"], "invalid_object_key")
        self.assertFalse(Product.objects.filter(sku="MDL-000142").exists())

    def test_rejected_product_reimport_sets_pending_review(self) -> None:
        self._authenticate_as_admin()
        Product.objects.create(
            category=self.furniture,
            name="Rejected Chair",
            slug="rejected-chair",
            sku="MDL-000142",
            price=Decimal("10.00"),
            status=Product.Status.REJECTED,
        )
        response = self._post_batch([_happy_item()])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated"], 1)
        product = Product.objects.get(sku="MDL-000142")
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
        self.assertEqual(product.name, "Studio Chair Oak")

    def test_public_serializers_omit_storage_path_for_imported(self) -> None:
        self._authenticate_as_admin()
        self._post_batch([_happy_item()])
        product = Product.objects.get(sku="MDL-000142")
        product.status = Product.Status.PUBLISHED
        product.save(update_fields=["status", "updated_at"])

        self.client.credentials()
        detail = self.client.get(
            reverse("products:product-detail", kwargs={"slug": product.slug})
        )
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        for file_row in detail.data.get("files", []):
            self.assertNotIn("storage_path", file_row)


def _image_bytes(fmt: str, color: tuple[int, int, int]) -> bytes:
    output = BytesIO()
    Image.new("RGB", (32, 24), color=color).save(output, format=fmt)
    return output.getvalue()


def _webp_item(sku: str = "MDL-000900", **overrides: object) -> dict:
    return _happy_item(
        model_id=sku,
        r2_key_prefix=f"models/{sku}/",
        **overrides,
        media={
            "thumbnail_key": f"models/{sku}/thumbnail.jpg",
            "preview_key": f"models/{sku}/preview.glb",
            "package_key": f"models/{sku}/package.zip",
            "package_file_size": 1048576,
            "gallery_keys": [f"models/{sku}/gallery/01.png"],
        },
    )


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class CatalogImportWebpTests(APITestCase):
    """Pipeline thumbnails and gallery images are served as WebP and must exist."""

    _authenticate_as_admin = CatalogImportAPITests._authenticate_as_admin
    _post_batch = CatalogImportAPITests._post_batch

    def setUp(self) -> None:
        CatalogImportAPITests.setUp(self)
        self._authenticate_as_admin()
        self.addCleanup(self._remove_folder, "models/MDL-000900")

    @staticmethod
    def _remove_folder(prefix: str) -> None:
        directories, files = default_storage.listdir(prefix) if default_storage.exists(prefix) else ([], [])
        for name in files:
            default_storage.delete(f"{prefix}/{name}")
        for name in directories:
            CatalogImportWebpTests._remove_folder(f"{prefix}/{name}")

    @staticmethod
    def _put(key: str, data: bytes) -> None:
        if default_storage.exists(key):
            default_storage.delete(key)
        default_storage.save(key, ContentFile(data))

    @staticmethod
    def _key(url: str) -> str:
        return url.split("/media/", 1)[-1]

    def test_pipeline_images_are_served_as_webp(self) -> None:
        self._put("models/MDL-000900/thumbnail.jpg", _image_bytes("JPEG", (200, 40, 40)))
        self._put("models/MDL-000900/gallery/01.png", _image_bytes("PNG", (40, 200, 40)))

        response = self._post_batch([_webp_item()])

        self.assertEqual(response.data["created"], 1, response.data)
        product = Product.objects.get(sku="MDL-000900")
        self.assertRegex(product.thumbnail, r"models/MDL-000900/thumbnail-[0-9a-f]{12}\.webp$")
        gallery = ProductImage.objects.get(product=product)
        self.assertRegex(gallery.image_url, r"models/MDL-000900/gallery/01-[0-9a-f]{12}\.webp$")
        for url in (product.thumbnail, gallery.image_url):
            with default_storage.open(self._key(url), "rb") as handle:
                self.assertEqual(Image.open(handle).format, "WEBP")

    def test_changed_thumbnail_replaces_the_previous_webp(self) -> None:
        self._put("models/MDL-000900/thumbnail.jpg", _image_bytes("JPEG", (200, 40, 40)))
        self._post_batch([_webp_item()])
        first = Product.objects.get(sku="MDL-000900").thumbnail

        self._put("models/MDL-000900/thumbnail.jpg", _image_bytes("JPEG", (40, 40, 200)))
        response = self._post_batch([_webp_item()], batch_id="2026-09-03-run-02")

        self.assertEqual(response.data["updated"], 1, response.data)
        second = Product.objects.get(sku="MDL-000900").thumbnail
        self.assertNotEqual(first, second)
        self.assertTrue(default_storage.exists(self._key(second)))
        self.assertFalse(default_storage.exists(self._key(first)))

    def test_unreadable_thumbnail_skips_the_row(self) -> None:
        self._put("models/MDL-000900/thumbnail.jpg", b"not an image")

        response = self._post_batch([_webp_item()])

        self.assertEqual(response.data["skipped"], 1)
        self.assertEqual(response.data["results"][0]["reason"], "invalid_thumbnail")
        self.assertFalse(Product.objects.filter(sku="MDL-000900").exists())

    def _post_without_uploads(self, items: list[dict], *, batch_id: str = "2026-09-03-run-01"):
        return self.client.post(
            self.import_url,
            {"import_batch_id": batch_id, "import_source": "catalog-bridge", "items": items},
            format="json",
        )

    def test_missing_thumbnail_object_skips_the_row(self) -> None:
        response = self._post_without_uploads([_webp_item()])

        self.assertEqual(response.data["skipped"], 1)
        self.assertEqual(response.data["results"][0]["reason"], "missing_thumbnail_object")
        self.assertFalse(Product.objects.filter(sku="MDL-000900").exists())

    def test_missing_gallery_object_skips_the_row(self) -> None:
        self._put("models/MDL-000900/thumbnail.jpg", _image_bytes("JPEG", (200, 40, 40)))

        response = self._post_without_uploads([_webp_item()])

        self.assertEqual(response.data["skipped"], 1)
        self.assertEqual(response.data["results"][0]["reason"], "missing_gallery_object")
        self.assertFalse(Product.objects.filter(sku="MDL-000900").exists())

    def test_reimport_without_the_thumbnail_keeps_the_existing_one(self) -> None:
        self._post_batch([_webp_item()])
        kept = Product.objects.get(sku="MDL-000900").thumbnail
        self.assertTrue(default_storage.exists(self._key(kept)))

        # The pipeline uploads a new preview but no longer has the thumbnail source.
        put_pipeline_uploads([_webp_item()])
        default_storage.delete("models/MDL-000900/thumbnail.jpg")
        response = self._post_without_uploads([_webp_item()], batch_id="2026-09-03-run-02")

        self.assertEqual(response.data["updated"], 1, response.data)
        self.assertEqual(Product.objects.get(sku="MDL-000900").thumbnail, kept)

    def test_preview_without_polygon_count_is_flagged_as_unchecked(self) -> None:
        put_pipeline_uploads([_webp_item()])

        with self.assertLogs("products.catalog_import", level="WARNING") as logs:
            response = self._post_without_uploads([_webp_item(polygon_count=None)])

        self.assertEqual(response.data["created"], 1, response.data)
        self.assertEqual(response.data["results"][0]["warning"], "preview_unchecked")
        self.assertTrue(any("catalog_import_preview_unchecked" in line for line in logs.output))

    def test_checked_preview_has_no_warning(self) -> None:
        response = self._post_batch([_webp_item()])

        self.assertEqual(response.data["created"], 1, response.data)
        self.assertNotIn("warning", response.data["results"][0])
