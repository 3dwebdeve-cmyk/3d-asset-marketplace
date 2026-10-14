import io
import tempfile
import struct
from zipfile import ZipFile
from decimal import Decimal

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
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
from products.services import ProductError, ProductService


def make_image_bytes(format_name: str = "PNG", size=(64, 64), color=(20, 120, 200)) -> bytes:
    buffer = io.BytesIO()
    image = Image.new("RGB", size, color=color)
    image.save(buffer, format=format_name)
    return buffer.getvalue()


def make_glb_bytes():
    document = b'{"asset":{"version":"2.0"}}'
    document += b" " * (-len(document) % 4)
    return struct.pack("<4sIIII", b"glTF", 2, 20 + len(document), len(document), 0x4E4F534A) + document


def make_usdz_bytes():
    buffer = io.BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr("chair.usda", '#usda 1.0\n')
    return buffer.getvalue()


class ProductPublicAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.published = Product.objects.create(
            category=self.category,
            name="Oak Chair",
            slug="oak-chair",
            short_description="A wooden chair",
            price=Decimal("29.99"),
            status=Product.Status.PUBLISHED,
        )
        self.draft = Product.objects.create(
            category=self.category,
            name="Hidden Desk",
            slug="hidden-desk",
            price=Decimal("99.00"),
            status=Product.Status.DRAFT,
        )
        ProductImage.objects.create(
            product=self.published,
            image_url="http://127.0.0.1:8000/media/products/images/demo.png",
            display_order=0,
            is_primary=True,
        )
        ProductFile.objects.create(
            product=self.published,
            file_name="oak-chair.zip",
            file_format="zip",
            file_size=1024,
            storage_path="http://127.0.0.1:8000/media/products/files/secret.zip",
            is_preview=False,
        )
        self.list_url = reverse("products:product-list")
        self.detail_url = reverse(
            "products:product-detail",
            kwargs={"slug": "oak-chair"},
        )

    def test_catalog_response_supports_conditional_etag_requests(self) -> None:
        first = self.client.get(self.list_url)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertTrue(first.get("ETag"))

        second = self.client.get(self.list_url, HTTP_IF_NONE_MATCH=first["ETag"])
        self.assertEqual(second.status_code, status.HTTP_304_NOT_MODIFIED)
        self.assertEqual(second.get("ETag"), first.get("ETag"))

    def test_list_returns_only_published_products(self) -> None:
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "oak-chair")
        self.assertEqual(response.data["results"][0]["formats"], ["zip"])
        self.assertIn("public", (response.get("Cache-Control") or "").lower())

    def test_list_excludes_pending_review_and_rejected(self) -> None:
        Product.objects.create(
            category=self.category,
            name="Pending QA Model",
            slug="pending-qa-model",
            price=Decimal("10.00"),
            status=Product.Status.PENDING_REVIEW,
        )
        Product.objects.create(
            category=self.category,
            name="Rejected Model",
            slug="rejected-model",
            price=Decimal("10.00"),
            status=Product.Status.REJECTED,
        )
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        slugs = {item["slug"] for item in response.data["results"]}
        self.assertEqual(slugs, {"oak-chair"})

    def test_list_filters_by_category(self) -> None:
        other = Category.objects.create(name="Vehicles", slug="vehicles")
        Product.objects.create(
            category=other,
            name="Sports Car",
            slug="sports-car",
            price=Decimal("49.00"),
            status=Product.Status.PUBLISHED,
        )

        response = self.client.get(
            self.list_url,
            {"category_id": str(self.category.pk)},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "oak-chair")

    def test_list_supports_search(self) -> None:
        response = self.client.get(self.list_url, {"search": "wooden"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_list_search_matches_software_used(self) -> None:
        self.published.software_used = "Blender 4.x"
        self.published.save(update_fields=["software_used", "updated_at"])
        Product.objects.create(
            category=self.category,
            name="Maya Character",
            slug="maya-character",
            price=Decimal("40.00"),
            software_used="Maya 2024",
            status=Product.Status.PUBLISHED,
        )

        response = self.client.get(self.list_url, {"search": "Blender"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "oak-chair")
        self.assertEqual(response.data["results"][0]["software_used"], "Blender 4.x")

    def test_list_filters_by_rigged(self) -> None:
        self.published.rigged = True
        self.published.save(update_fields=["rigged", "updated_at"])
        Product.objects.create(
            category=self.category,
            name="Static Prop",
            slug="static-prop",
            price=Decimal("15.00"),
            rigged=False,
            status=Product.Status.PUBLISHED,
        )

        response = self.client.get(self.list_url, {"rigged": "1"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "oak-chair")

    def test_list_ignores_invalid_bool_filter(self) -> None:
        response = self.client.get(self.list_url, {"rigged": "maybe"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_detail_returns_published_product_without_storage_path(self) -> None:
        response = self.client.get(self.detail_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["slug"], "oak-chair")
        self.assertEqual(len(response.data["images"]), 1)
        self.assertEqual(len(response.data["files"]), 1)
        self.assertNotIn("storage_path", response.data["files"][0])
        self.assertEqual(response.data["files"][0]["file_format"], "zip")

    def test_detail_hides_draft_product(self) -> None:
        url = reverse("products:product-detail", kwargs={"slug": "hidden-desk"})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ProductAdminAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"

        self.admin_user = User.objects.create_user(
            email="product-admin@example.com",
            full_name="Product Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])

        self.customer_user = User.objects.create_user(
            email="product-customer@example.com",
            full_name="Product Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )

        self.category = Category.objects.create(name="Architecture", slug="architecture")
        self.product = Product.objects.create(
            category=self.category,
            name="Modern House",
            slug="modern-house",
            price=Decimal("120.00"),
            status=Product.Status.DRAFT,
        )
        self.list_url = reverse("products_admin:admin-products")
        self.detail_url = reverse(
            "products_admin:admin-product-detail",
            kwargs={"product_id": self.product.pk},
        )
        self.admin_login_url = reverse("accounts:admin-login")

    def _authenticate_as_admin(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_admin_list_requires_administrator(self) -> None:
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        login = self.client.post(
            reverse("accounts:login"),
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_create_product(self) -> None:
        self._authenticate_as_admin()

        response = self.client.post(
            self.list_url,
            {
                "category_id": str(self.category.pk),
                "name": "Glass Pavilion",
                "price": "89.50",
                "short_description": "Modern glass structure",
                "status": "draft",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["slug"], "glass-pavilion")
        self.assertEqual(response.data["status"], "draft")
        self.assertTrue(Product.objects.filter(slug="glass-pavilion").exists())

    def test_admin_rejects_inactive_category(self) -> None:
        self.category.is_active = False
        self.category.save(update_fields=["is_active", "updated_at"])
        self._authenticate_as_admin()

        response = self.client.post(
            self.list_url,
            {
                "category_id": str(self.category.pk),
                "name": "Invalid Product",
                "price": "10.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("category_id", response.data)

    def test_admin_update_product(self) -> None:
        self._authenticate_as_admin()
        package_path = default_storage.save('products/files/admin-update.zip', ContentFile(b'package'))
        ProductFile.objects.create(product=self.product, file_name='admin-update.zip', file_format='zip',
                                   file_size=7, storage_path=package_path)

        # Publishing is only through the review queue, so a direct PATCH is refused.
        direct = self.client.patch(
            self.detail_url,
            {"status": "published", "price": "150.00", "preview_model": "https://example.com/model.glb"},
            format="json",
        )
        self.assertEqual(direct.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.patch(
            self.detail_url,
            {"status": "pending_review", "sku": "ADMIN-UPDATE-001", "price": "150.00",
             "preview_model": "https://example.com/model.glb"},
            format="json",
        )
        approve_url = reverse("products_admin:admin-product-approve", kwargs={"product_id": self.product.pk})
        response = self.client.post(approve_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.PUBLISHED)
        self.assertEqual(self.product.price, Decimal("150.00"))

    def test_admin_archive_product(self) -> None:
        self._authenticate_as_admin()

        response = self.client.delete(self.detail_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.ARCHIVED)

    def test_admin_rejects_discount_above_price(self) -> None:
        self._authenticate_as_admin()

        response = self.client.patch(
            self.detail_url,
            {"discount_price": "200.00"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("discount_price", response.data)

    def test_admin_qa_status_transitions(self) -> None:
        self._authenticate_as_admin()
        to_review = self.client.patch(
            self.detail_url,
            {"status": "pending_review"},
            format="json",
        )
        self.assertEqual(to_review.status_code, status.HTTP_200_OK)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.PENDING_REVIEW)

        reject = self.client.patch(
            self.detail_url,
            {"status": "rejected"},
            format="json",
        )
        self.assertEqual(reject.status_code, status.HTTP_200_OK)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.REJECTED)

        # Rejected cannot jump straight to published.
        illegal = self.client.patch(
            self.detail_url,
            {"status": "published"},
            format="json",
        )
        self.assertEqual(illegal.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", illegal.data)

    def test_admin_filter_by_pending_review(self) -> None:
        Product.objects.create(
            category=self.category,
            name="In QA",
            slug="in-qa",
            price=Decimal("12.00"),
            status=Product.Status.PENDING_REVIEW,
        )
        self._authenticate_as_admin()
        response = self.client.get(self.list_url, {"status": "pending_review"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {item["name"] for item in response.data["results"]}
        self.assertIn("In QA", names)
        self.assertNotIn(self.product.name, names)

    def test_admin_create_product_with_sku(self) -> None:
        self._authenticate_as_admin()

        response = self.client.post(
            self.list_url,
            {
                "category_id": str(self.category.pk),
                "name": "Batch Model",
                "price": "42.00",
                "sku": "mdl-000142",
                "import_batch_id": "batch-2026-08-04",
                "import_source": "batch_report",
                "glb_checksum": "a" * 64,
                "has_preview": True,
                "has_package": True,
                "status": "draft",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["sku"], "MDL-000142")
        self.assertEqual(response.data["import_batch_id"], "batch-2026-08-04")
        self.assertEqual(response.data["import_source"], "batch_report")
        self.assertTrue(response.data["has_preview"])
        self.assertTrue(response.data["has_package"])
        product = Product.objects.get(sku="MDL-000142")
        self.assertEqual(product.glb_checksum, "a" * 64)

    def test_admin_rejects_duplicate_sku(self) -> None:
        self.product.sku = "MDL-000142"
        self.product.save(update_fields=["sku", "updated_at"])
        self._authenticate_as_admin()

        response = self.client.post(
            self.list_url,
            {
                "category_id": str(self.category.pk),
                "name": "Duplicate SKU Product",
                "price": "10.00",
                "sku": "MDL-000142",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sku", response.data)

    def test_admin_rejects_invalid_sku(self) -> None:
        self._authenticate_as_admin()

        response = self.client.post(
            self.list_url,
            {
                "category_id": str(self.category.pk),
                "name": "Bad SKU Product",
                "price": "10.00",
                "sku": "bad sku!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sku", response.data)

    def test_admin_list_filter_by_sku(self) -> None:
        self.product.sku = "MDL-000142"
        self.product.save(update_fields=["sku", "updated_at"])
        other = Product.objects.create(
            category=self.category,
            name="Other Model",
            slug="other-model",
            price=Decimal("5.00"),
            sku="MDL-000999",
            status=Product.Status.DRAFT,
        )
        self._authenticate_as_admin()

        response = self.client.get(self.list_url, {"sku": "mdl-000142"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(self.product.pk))
        self.assertNotEqual(response.data["results"][0]["id"], str(other.pk))

    def test_admin_search_includes_sku(self) -> None:
        self.product.sku = "MDL-000142"
        self.product.save(update_fields=["sku", "updated_at"])
        self._authenticate_as_admin()

        response = self.client.get(self.list_url, {"search": "MDL-000"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["sku"], "MDL-000142")

    def test_admin_update_and_clear_sku(self) -> None:
        self._authenticate_as_admin()

        assign = self.client.patch(
            self.detail_url,
            {"sku": "MDL-000200"},
            format="json",
        )
        self.assertEqual(assign.status_code, status.HTTP_200_OK)
        self.assertEqual(assign.data["sku"], "MDL-000200")

        clear = self.client.patch(
            self.detail_url,
            {"sku": ""},
            format="json",
        )
        self.assertEqual(clear.status_code, status.HTTP_200_OK)
        self.assertIsNone(clear.data["sku"])
        self.product.refresh_from_db()
        self.assertIsNone(self.product.sku)

    def test_get_by_sku_service_lookup(self) -> None:
        self.product.sku = "MDL-000142"
        self.product.save(update_fields=["sku", "updated_at"])

        found = ProductService.get_by_sku("mdl-000142")
        self.assertEqual(found.pk, self.product.pk)

        with self.assertRaises(ProductError):
            ProductService.get_by_sku("MDL-MISSING")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ProductMediaUploadAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.password = "StrongPass123!"
        self.admin_user = User.objects.create_user(
            email="product-media-admin@example.com",
            full_name="Media Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])

        self.category = Category.objects.create(name="Nature", slug="nature")
        self.product = Product.objects.create(
            category=self.category,
            name="Pine Tree",
            slug="pine-tree",
            price=Decimal("15.00"),
            status=Product.Status.DRAFT,
        )
        self.images_url = reverse(
            "products_admin:admin-product-images",
            kwargs={"product_id": self.product.pk},
        )
        self.files_url = reverse(
            "products_admin:admin-product-files",
            kwargs={"product_id": self.product.pk},
        )
        self.admin_login_url = reverse("accounts:admin-login")

    def _authenticate_as_admin(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_upload_image_sets_thumbnail(self) -> None:
        self._authenticate_as_admin()
        image = SimpleUploadedFile(
            "gallery.png",
            make_image_bytes(),
            content_type="image/png",
        )

        response = self.client.post(
            self.images_url,
            {"image": image, "is_primary": True},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("/media/products/images/", response.data["image_url"])
        self.assertTrue(response.data["image_url"].endswith(".webp"))
        self.product.refresh_from_db()
        self.assertIn("/media/products/images/", self.product.thumbnail)
        self.assertEqual(ProductImage.objects.filter(product=self.product).count(), 1)

    def test_upload_rejects_invalid_image_extension(self) -> None:
        self._authenticate_as_admin()
        bad_file = SimpleUploadedFile(
            "gallery.exe",
            b"not-an-image",
            content_type="application/octet-stream",
        )

        response = self.client.post(
            self.images_url,
            {"image": bad_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upload_rejects_excessive_image_dimensions(self) -> None:
        self._authenticate_as_admin()
        # A highly-compressible solid image stays below the byte limit but must
        # still be rejected before it can consume excessive browser/server RAM.
        image = SimpleUploadedFile(
            "oversized.png",
            make_image_bytes(size=(5_000, 5_000)),
            content_type="image/png",
        )

        response = self.client.post(
            self.images_url,
            {"image": image},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("20 megapixel", str(response.data))

    def test_upload_preview_file_sets_preview_model(self) -> None:
        self._authenticate_as_admin()
        glb = SimpleUploadedFile(
            "preview.glb",
            make_glb_bytes(),
            content_type="model/gltf-binary",
        )

        response = self.client.post(
            self.files_url,
            {"file": glb, "is_preview": True, "version": "1.0"},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["file_format"], "glb")
        self.assertTrue(response.data["is_preview"])
        self.assertIn("storage_path", response.data)
        self.product.refresh_from_db()
        self.assertIn("/media/products/previews/", self.product.preview_model)
        self.assertEqual(ProductFile.objects.filter(product=self.product).count(), 1)

    def test_upload_glb_without_preview_flag_still_sets_preview_model(self) -> None:
        self._authenticate_as_admin()
        glb = SimpleUploadedFile(
            "auto-preview.glb",
            make_glb_bytes(),
            content_type="model/gltf-binary",
        )

        response = self.client.post(
            self.files_url,
            {"file": glb, "is_preview": False, "version": "1.0"},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["is_preview"])
        self.product.refresh_from_db()
        self.assertIn("/media/products/previews/", self.product.preview_model)

    def test_upload_usdz_file(self) -> None:
        self._authenticate_as_admin()
        usdz = SimpleUploadedFile(
            "chair.usdz",
            make_usdz_bytes(),
            content_type="model/vnd.usdz+zip",
        )

        response = self.client.post(
            self.files_url,
            {"file": usdz, "version": "1.0"},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["file_format"], "usdz")
        self.assertEqual(response.data["file_name"], "chair.usdz")

    def test_delete_image(self) -> None:
        self._authenticate_as_admin()
        image = SimpleUploadedFile(
            "gallery.png",
            make_image_bytes(),
            content_type="image/png",
        )
        upload = self.client.post(
            self.images_url,
            {"image": image, "is_primary": True},
            format="multipart",
        )
        self.assertEqual(upload.status_code, status.HTTP_201_CREATED)
        image_id = upload.data["id"]

        delete_url = reverse(
            "products_admin:admin-product-image-detail",
            kwargs={"product_id": self.product.pk, "image_id": image_id},
        )
        response = self.client.delete(delete_url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ProductImage.objects.filter(pk=image_id).exists())
