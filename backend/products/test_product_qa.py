"""Feature 16 Phase 8 — QA approve / reject / requeue publish workflow tests."""

from __future__ import annotations

import tempfile
from decimal import Decimal
from io import BytesIO
from zipfile import ZipFile

from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category
from products.models import Product, ProductFile
from products.test_catalog_import import _happy_item
from products.testing import make_glb_bytes, put_pipeline_images, put_pipeline_uploads


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ProductQAWorkflowAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"

        self.admin_user = User.objects.create_user(
            email="qa-admin@example.com",
            full_name="QA Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])

        self.customer_user = User.objects.create_user(
            email="qa-customer@example.com",
            full_name="QA Customer",
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
        self.admin_list_url = reverse("products_admin:admin-products")
        self.admin_login_url = reverse("accounts:admin-login")

    def _authenticate_as_admin(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _authenticate_as_customer(self) -> None:
        login = self.client.post(
            reverse("accounts:login"),
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _write_package(self, storage_path: str) -> None:
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("model.glb", b"glTF-binary")
        default_storage.save(storage_path, ContentFile(buffer.getvalue()))

    def _import_happy_product(self, *, with_package_object: bool = True) -> Product:
        put_pipeline_uploads([_happy_item()])
        response = self.client.post(
            self.import_url,
            {
                "import_batch_id": "2026-09-07-qa-01",
                "import_source": "catalog-bridge",
                "items": [_happy_item()],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created"], 1)
        product = Product.objects.get(sku="MDL-000142")
        if with_package_object:
            package = ProductFile.objects.get(product=product, is_preview=False)
            self._write_package(package.storage_path)
        return product

    def _approve_url(self, product_id) -> str:
        return reverse(
            "products_admin:admin-product-approve",
            kwargs={"product_id": product_id},
        )

    def _reject_url(self, product_id) -> str:
        return reverse(
            "products_admin:admin-product-reject",
            kwargs={"product_id": product_id},
        )

    def _requeue_url(self, product_id) -> str:
        return reverse(
            "products_admin:admin-product-requeue",
            kwargs={"product_id": product_id},
        )

    def test_import_approve_appears_in_public_list(self) -> None:
        self._authenticate_as_admin()
        product = self._import_happy_product()

        approve = self.client.post(self._approve_url(product.pk), {}, format="json")
        self.assertEqual(approve.status_code, status.HTTP_200_OK)
        self.assertEqual(approve.data["status"], "published")
        self.assertEqual(approve.data["reject_reason"], "")
        self.assertEqual(str(approve.data["reviewed_by"]), str(self.admin_user.pk))
        self.assertIsNotNone(approve.data["reviewed_at"])

        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PUBLISHED)
        self.assertEqual(product.reviewed_by_id, self.admin_user.pk)

        self.client.credentials()
        public = self.client.get(self.public_list_url)
        self.assertEqual(public.status_code, status.HTTP_200_OK)
        slugs = {row["slug"] for row in public.data["results"]}
        self.assertIn(product.slug, slugs)
        for row in public.data["results"]:
            self.assertNotIn("reject_reason", row)
            self.assertNotIn("reviewed_by", row)

    def test_reject_stores_reason_and_hides_publicly(self) -> None:
        self._authenticate_as_admin()
        product = self._import_happy_product()

        reject = self.client.post(
            self._reject_url(product.pk),
            {"reason": "Missing textures in package", "qa_notes": "Re-export FBX"},
            format="json",
        )
        self.assertEqual(reject.status_code, status.HTTP_200_OK)
        self.assertEqual(reject.data["status"], "rejected")
        self.assertEqual(reject.data["reject_reason"], "Missing textures in package")
        self.assertEqual(reject.data["qa_notes"], "Re-export FBX")

        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.REJECTED)
        self.assertEqual(product.reject_reason, "Missing textures in package")

        self.client.credentials()
        public = self.client.get(self.public_list_url)
        slugs = {row["slug"] for row in public.data["results"]}
        self.assertNotIn(product.slug, slugs)

        detail = self.client.get(
            reverse("products:product-detail", kwargs={"slug": product.slug})
        )
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_approve_blocked_when_publish_gates_fail(self) -> None:
        self._authenticate_as_admin()
        product = Product.objects.create(
            category=self.furniture,
            name="Incomplete Model",
            slug="incomplete-model",
            sku="MDL-GATE-01",
            price=Decimal("10.00"),
            status=Product.Status.PENDING_REVIEW,
            import_batch_id="gate-batch",
            preview_model="",
        )

        response = self.client.post(self._approve_url(product.pk), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("files", response.data)
        self.assertIn("preview_model", response.data)

        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)

    def test_approve_blocked_when_package_object_missing(self) -> None:
        self._authenticate_as_admin()
        default_storage.save(
            "models/MDL-MISS-01/preview.glb", ContentFile(make_glb_bytes(100))
        )
        items = [
            _happy_item(
                model_id="MDL-MISS-01",
                r2_key_prefix="models/MDL-MISS-01/",
                media={
                    "thumbnail_key": "models/MDL-MISS-01/thumbnail.jpg",
                    "preview_key": "models/MDL-MISS-01/preview.glb",
                    "package_key": "models/MDL-MISS-01/package.zip",
                    "package_file_name": "package.zip",
                    "package_file_format": "zip",
                    "package_file_size": 1048576,
                    "gallery_keys": ["models/MDL-MISS-01/gallery/01.jpg"],
                },
            )
        ]
        put_pipeline_images(items)
        response = self.client.post(
            self.import_url,
            {
                "import_batch_id": "2026-09-07-qa-missing-pkg",
                "import_source": "catalog-bridge",
                "items": items,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["created"], 1)
        product = Product.objects.get(sku="MDL-MISS-01")
        package = ProductFile.objects.get(product=product, is_preview=False)
        if default_storage.exists(package.storage_path):
            default_storage.delete(package.storage_path)

        blocked = self.client.post(self._approve_url(product.pk), {}, format="json")
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("files", blocked.data)
        self.assertTrue(
            any("missing from private storage" in msg for msg in blocked.data["files"])
        )
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)

    def test_non_admin_cannot_approve_or_reject(self) -> None:
        self._authenticate_as_admin()
        product = self._import_happy_product()

        self._authenticate_as_customer()
        approve = self.client.post(self._approve_url(product.pk), {}, format="json")
        self.assertEqual(approve.status_code, status.HTTP_403_FORBIDDEN)

        reject = self.client.post(
            self._reject_url(product.pk),
            {"reason": "Nope"},
            format="json",
        )
        self.assertEqual(reject.status_code, status.HTTP_403_FORBIDDEN)

        requeue = self.client.post(self._requeue_url(product.pk), {}, format="json")
        self.assertEqual(requeue.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_transitions_rejected(self) -> None:
        self._authenticate_as_admin()
        product = self._import_happy_product()

        # Cannot reject without reason.
        empty_reason = self.client.post(
            self._reject_url(product.pk),
            {"reason": "   "},
            format="json",
        )
        self.assertEqual(empty_reason.status_code, status.HTTP_400_BAD_REQUEST)

        # Cannot requeue while still pending_review.
        requeue = self.client.post(self._requeue_url(product.pk), {}, format="json")
        self.assertEqual(requeue.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", requeue.data)

        # Imported products cannot PATCH straight to published.
        detail_url = reverse(
            "products_admin:admin-product-detail",
            kwargs={"product_id": product.pk},
        )
        patch_publish = self.client.patch(
            detail_url,
            {"status": "published"},
            format="json",
        )
        self.assertEqual(patch_publish.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", patch_publish.data)

        # Approve then cannot approve again.
        approve = self.client.post(self._approve_url(product.pk), {}, format="json")
        self.assertEqual(approve.status_code, status.HTTP_200_OK)
        again = self.client.post(self._approve_url(product.pk), {}, format="json")
        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", again.data)

    def test_rejected_requeue_then_approve(self) -> None:
        self._authenticate_as_admin()
        product = self._import_happy_product()

        reject = self.client.post(
            self._reject_url(product.pk),
            {"reason": "Checksum mismatch"},
            format="json",
        )
        self.assertEqual(reject.status_code, status.HTTP_200_OK)

        requeue = self.client.post(self._requeue_url(product.pk), {}, format="json")
        self.assertEqual(requeue.status_code, status.HTTP_200_OK)
        self.assertEqual(requeue.data["status"], "pending_review")
        # Prefer keep reject_reason until next reject/approve overwrites.
        self.assertEqual(requeue.data["reject_reason"], "Checksum mismatch")

        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
        self.assertEqual(product.reject_reason, "Checksum mismatch")

        approve = self.client.post(self._approve_url(product.pk), {}, format="json")
        self.assertEqual(approve.status_code, status.HTTP_200_OK)
        self.assertEqual(approve.data["status"], "published")
        self.assertEqual(approve.data["reject_reason"], "")

        self.client.credentials()
        public = self.client.get(self.public_list_url)
        slugs = {row["slug"] for row in public.data["results"]}
        self.assertIn(product.slug, slugs)

    def test_manual_create_cannot_bypass_publish_gates(self) -> None:
        """Manual products must be created as drafts before package upload."""
        self._authenticate_as_admin()
        create = self.client.post(
            self.admin_list_url,
            {
                "category_id": str(self.furniture.pk),
                "name": "Manual Prop",
                "price": "19.00",
                "status": "published",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Product.objects.filter(name='Manual Prop').exists())
        draft = Product.objects.create(
            category=self.furniture,
            name="Manual Draft",
            slug="manual-draft",
            price=Decimal("5.00"),
            status=Product.Status.DRAFT,
        )
        detail_url = reverse(
            "products_admin:admin-product-detail",
            kwargs={"product_id": draft.pk},
        )
        patch = self.client.patch(
            detail_url,
            {"status": "published"},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_400_BAD_REQUEST)
        draft.refresh_from_db()
        self.assertEqual(draft.status, Product.Status.DRAFT)
        package_path = 'products/files/manual-publish.zip'
        self._write_package(package_path)
        ProductFile.objects.create(product=draft, file_name='manual-publish.zip', file_format='zip',
                                   file_size=10, storage_path=package_path)
        # Direct publish is refused even with a package: review must approve it.
        direct = self.client.patch(detail_url, {
            'status': 'published', 'preview_model': 'https://example.com/manual.glb',
        }, format='json')
        self.assertEqual(direct.status_code, status.HTTP_400_BAD_REQUEST)
        submit = self.client.patch(detail_url, {
            'status': 'pending_review', 'sku': 'MANUAL-PROP-001',
            'preview_model': 'https://example.com/manual.glb',
        }, format='json')
        self.assertEqual(submit.status_code, status.HTTP_200_OK)
        approve_url = reverse('products_admin:admin-product-approve', kwargs={'product_id': draft.pk})
        patch = self.client.post(approve_url, {}, format='json')
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        # Admin serializer exposes QA metadata; public serializers must not.
        self.assertIn('reject_reason', patch.data)
        self.assertIn('reviewed_by', patch.data)
        draft.refresh_from_db()
        self.assertEqual(draft.status, Product.Status.PUBLISHED)

    def test_public_detail_omits_qa_internals(self) -> None:
        self._authenticate_as_admin()
        product = self._import_happy_product()
        self.client.post(
            self._reject_url(product.pk),
            {"reason": "Internal QA note"},
            format="json",
        )
        # Force publish for serializer field check without approve (status only).
        product.refresh_from_db()
        ProductFile.objects.filter(product=product, is_preview=False).exists()
        product.status = Product.Status.PUBLISHED
        product.save(update_fields=["status", "updated_at"])

        self.client.credentials()
        detail = self.client.get(
            reverse("products:product-detail", kwargs={"slug": product.slug})
        )
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertNotIn("reject_reason", detail.data)
        self.assertNotIn("qa_notes", detail.data)
        self.assertNotIn("reviewed_by", detail.data)
        self.assertNotIn("reviewed_at", detail.data)
