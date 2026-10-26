"""Feature 16 Phase 6 — Catalog Import API tests."""

from __future__ import annotations

import tempfile
from decimal import Decimal

from django.core.cache import cache
from django.core.files.storage import default_storage
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category
from products.models import Product, ProductFile, ProductImage
from products.testing import put_pipeline_objects, put_pipeline_previews

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
        put_pipeline_objects(items)
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
        self.assertIn("models/MDL-000142/thumbnail.jpg", product.thumbnail)
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
        self.assertIn("models/MDL-000142/gallery/01.jpg", gallery[0].image_url)

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


def _pipeline_item(sku: str = "FUR-CHR-000123", **overrides: object) -> dict:
    """A row as the 3ds Max plugin sends it: <ID>.zip, preview_<ID>.glb, package_formats."""
    item = _happy_item(
        model_id=sku,
        r2_key_prefix=f"models/{sku}/",
        exports={},
        package_formats=["fbx", "max"],
        media={
            "thumbnail_key": f"models/{sku}/previewthumb_{sku}.jpg",
            "preview_key": f"models/{sku}/preview_{sku}.glb",
            "package_key": f"models/{sku}/{sku}.zip",
            "package_file_size": 1048576,
        },
    )
    item.update(overrides)
    return item


class PipelineCatalogImportTests(CatalogImportTestBase):
    """3ds Max pipeline names, package checks, subcategory warnings, package formats."""

    def _skip_reason(self, item: dict) -> str:
        response = self._post_batch([item])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["skipped"], 1, response.data)
        return response.data["results"][0]["reason"]

    def test_pipeline_package_key_is_accepted_and_named_after_the_id(self) -> None:
        self._authenticate_as_admin()
        response = self._post_batch([_pipeline_item()])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created"], 1, response.data)
        self.assertNotIn("warnings", response.data["results"][0])
        product = Product.objects.get(sku="FUR-CHR-000123")
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
        self.assertIn("models/FUR-CHR-000123/previewthumb_FUR-CHR-000123.jpg", product.thumbnail)
        self.assertRegex(
            product.preview_model, r"models/FUR-CHR-000123/preview-[0-9a-f]{32}\.glb$"
        )
        self.assertFalse(default_storage.exists("models/FUR-CHR-000123/preview_FUR-CHR-000123.glb"))
        package = ProductFile.objects.get(product=product, is_preview=False)
        self.assertEqual(package.storage_path, "models/FUR-CHR-000123/FUR-CHR-000123.zip")
        self.assertEqual(package.file_name, "FUR-CHR-000123.zip")

    def test_explicit_package_file_name_is_kept(self) -> None:
        self._authenticate_as_admin()
        item = _pipeline_item()
        item["media"]["package_file_name"] = "Oak Chair.zip"
        self._post_batch([item])
        package = ProductFile.objects.get(product__sku="FUR-CHR-000123", is_preview=False)
        self.assertEqual(package.file_name, "Oak Chair.zip")

    def test_other_zip_name_is_rejected_as_package(self) -> None:
        self._authenticate_as_admin()
        for name in ("Other.zip", "FUR-CHR-000999.zip", "fur-chr-000123.ZIP"):
            item = _pipeline_item()
            item["media"]["package_key"] = f"models/FUR-CHR-000123/{name}"
            with self.subTest(name=name):
                self.assertEqual(self._skip_reason(item), "invalid_object_key")
        self.assertFalse(Product.objects.filter(sku="FUR-CHR-000123").exists())

    def test_zip_is_rejected_as_thumbnail_preview_or_gallery(self) -> None:
        self._authenticate_as_admin()
        zip_key = "models/FUR-CHR-000123/FUR-CHR-000123.zip"
        for field_name, value in (
            ("thumbnail_key", zip_key),
            ("preview_key", zip_key),
            ("gallery_keys", [zip_key]),
            ("thumbnail_key", "models/FUR-CHR-000123/Image.ZIP"),
        ):
            item = _pipeline_item()
            item["media"][field_name] = value
            with self.subTest(field=field_name, value=value):
                self.assertEqual(self._skip_reason(item), "invalid_object_key")
        self.assertFalse(Product.objects.filter(sku="FUR-CHR-000123").exists())

    def test_missing_package_object_skips_row_and_keeps_preview(self) -> None:
        self._authenticate_as_admin()
        # A SKU no other test uploads: MEDIA_ROOT is shared across this class.
        item = _pipeline_item("FUR-CHR-000777")
        put_pipeline_previews([item])  # the preview arrived, the zip upload failed
        response = self.client.post(
            self.import_url,
            {"import_batch_id": "2026-10-26-missing", "items": [item]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["skipped"], 1)
        self.assertEqual(response.data["results"][0]["reason"], "missing_package_object")
        self.assertFalse(Product.objects.filter(sku="FUR-CHR-000777").exists())
        # A retry after re-uploading the zip still finds the preview.
        self.assertTrue(
            default_storage.exists("models/FUR-CHR-000777/preview_FUR-CHR-000777.glb")
        )

    def test_missing_subcategory_falls_back_with_warning(self) -> None:
        self._authenticate_as_admin()
        response = self._post_batch([_pipeline_item(subcategory="Tables")])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = response.data["results"][0]
        self.assertEqual(row["action"], "created")
        self.assertEqual(row["warnings"], ["subcategory_not_found"])
        self.assertEqual(Product.objects.get(sku="FUR-CHR-000123").category_id, self.furniture.pk)

    def test_existing_subcategory_has_no_warning(self) -> None:
        self._authenticate_as_admin()
        response = self._post_batch([_pipeline_item(subcategory="chairs")])
        self.assertNotIn("warnings", response.data["results"][0])
        self.assertEqual(Product.objects.get(sku="FUR-CHR-000123").category_id, self.chairs.pk)

    def test_package_formats_gate(self) -> None:
        self._authenticate_as_admin()
        cases = (
            ("FUR-CHR-000201", ["blend"], "created"),
            ("FUR-CHR-000202", [".FBX", "glb"], "created"),
            ("FUR-CHR-000203", ["glb"], "exports_incomplete"),
            ("FUR-CHR-000204", ["glb", "gltf"], "exports_incomplete"),
            ("FUR-CHR-000205", [], "exports_incomplete"),
        )
        for sku, formats, expected in cases:
            with self.subTest(formats=formats):
                response = self._post_batch([_pipeline_item(sku, package_formats=formats)])
                row = response.data["results"][0]
                self.assertEqual(row.get("reason") or row["action"], expected)

    def test_bridge_exports_still_pass_without_package_formats(self) -> None:
        self._authenticate_as_admin()
        item = _pipeline_item(exports=_happy_item()["exports"])
        del item["package_formats"]
        response = self._post_batch([item])
        self.assertEqual(response.data["created"], 1, response.data)
        self.assertEqual(Product.objects.get(sku="FUR-CHR-000123").package_formats, [])

    def test_package_formats_are_stored_and_updated(self) -> None:
        self._authenticate_as_admin()
        self._post_batch([_pipeline_item(package_formats=["MAX", ".fbx", "fbx"])])
        product = Product.objects.get(sku="FUR-CHR-000123")
        self.assertEqual(product.package_formats, ["fbx", "max"])

        self._post_batch([_pipeline_item(package_formats=["obj"])], batch_id="2026-10-26-run-02")
        product.refresh_from_db()
        self.assertEqual(product.package_formats, ["obj"])

    def test_public_formats_list_package_contents_not_the_archive(self) -> None:
        self._authenticate_as_admin()
        self._post_batch([_pipeline_item(package_formats=["max", "fbx"])])
        product = Product.objects.get(sku="FUR-CHR-000123")
        product.status = Product.Status.PUBLISHED
        product.save(update_fields=["status", "updated_at"])
        self.client.credentials()

        listing = self.client.get(self.public_list_url)
        row = next(r for r in listing.data["results"] if r["slug"] == product.slug)
        self.assertEqual(row["formats"], ["fbx", "max"])

        detail = self.client.get(reverse("products:product-detail", kwargs={"slug": product.slug}))
        self.assertEqual(detail.data["formats"], ["fbx", "max"])
