"""Feature 16 Phase 9 — import → QA → Stripe checkout → entitled download."""

from __future__ import annotations

from io import BytesIO
from unittest.mock import patch
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
from downloads.models import DownloadHistory
from orders.models import Order
from payments.models import Payment
from payments.test_payments import _FakeEvent, _fake_session
from products.models import Product, ProductFile
from products.test_catalog_import import _happy_item


@override_settings(STRIPE_SECRET_KEY="sk_test_dummy", STRIPE_WEBHOOK_SECRET="whsec_test")
class CatalogImportCommerceE2ETests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")

        self.admin_user = User.objects.create_user(
            email="e2e-admin@example.com",
            full_name="E2E Admin",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])

        self.customer = User.objects.create_user(
            email="e2e-buyer@example.com",
            full_name="E2E Buyer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )

        self.furniture = Category.objects.create(name="Furniture", slug="furniture")
        Category.objects.create(name="Chairs", slug="chairs", parent=self.furniture)

        self.import_url = reverse("products_admin:admin-catalog-import")
        self.public_list_url = reverse("products:product-list")
        self.cart_url = reverse("cart:cart-detail")
        self.checkout_url = reverse("payments:checkout")
        self.webhook_url = reverse("payments:webhook")
        self.admin_login_url = reverse("accounts:admin-login")
        self.login_url = reverse("accounts:login")

    def _authenticate_admin(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _authenticate_customer(self) -> None:
        response = self.client.post(
            self.login_url,
            {"email": self.customer.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _write_package(self, storage_path: str) -> bytes:
        buffer = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("model.glb", b"glTF-binary")
        payload = buffer.getvalue()
        default_storage.save(storage_path, ContentFile(payload))
        return payload

    def test_import_qa_pay_download_happy_path(self) -> None:
        self._authenticate_admin()
        imported = self.client.post(
            self.import_url,
            {
                "import_batch_id": "2026-09-10-e2e",
                "import_source": "catalog-bridge",
                "items": [_happy_item()],
            },
            format="json",
        )
        self.assertEqual(imported.status_code, status.HTTP_200_OK)
        self.assertEqual(imported.data["created"], 1)

        product = Product.objects.get(sku="MDL-000142")
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)
        package = ProductFile.objects.get(product=product, is_preview=False)
        payload = self._write_package(package.storage_path)

        self.client.credentials()
        public_before = self.client.get(self.public_list_url)
        self.assertNotIn(product.slug, {row["slug"] for row in public_before.data["results"]})

        self._authenticate_customer()
        blocked_cart = self.client.post(
            self.cart_url,
            {
                "product_type": "product",
                "product_id": str(product.pk),
                "quantity": 1,
            },
            format="json",
        )
        self.assertEqual(blocked_cart.status_code, status.HTTP_400_BAD_REQUEST)

        self._authenticate_admin()
        approve = self.client.post(
            reverse("products_admin:admin-product-approve", kwargs={"product_id": product.pk}),
            {},
            format="json",
        )
        self.assertEqual(approve.status_code, status.HTTP_200_OK)
        self.assertEqual(approve.data["status"], "published")

        self.client.credentials()
        public_after = self.client.get(self.public_list_url)
        self.assertIn(product.slug, {row["slug"] for row in public_after.data["results"]})

        self._authenticate_customer()
        added = self.client.post(
            self.cart_url,
            {
                "product_type": "product",
                "product_id": str(product.pk),
                "quantity": 1,
            },
            format="json",
        )
        self.assertEqual(added.status_code, status.HTTP_201_CREATED)

        download_url = reverse(
            "downloads:product-file-download",
            kwargs={"product_id": product.pk, "file_id": package.pk},
        )
        unpaid = self.client.get(download_url)
        self.assertEqual(unpaid.status_code, status.HTTP_404_NOT_FOUND)

        with patch(
            "payments.services.stripe.checkout.Session.create",
            return_value=_fake_session("cs_test_e2e"),
        ):
            checkout = self.client.post(self.checkout_url)
        self.assertEqual(checkout.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(pk=checkout.data["order_id"])
        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.stripe_checkout_session_id, "cs_test_e2e")
        self.assertEqual(order.payment_status, Order.PaymentStatus.PENDING)

        still_unpaid = self.client.get(download_url)
        self.assertEqual(still_unpaid.status_code, status.HTTP_404_NOT_FOUND)

        event = _FakeEvent(
            "evt_e2e_paid",
            "checkout.session.completed",
            {"id": "cs_test_e2e", "payment_intent": "pi_e2e_1"},
        )
        with patch("payments.views.stripe.Webhook.construct_event", return_value=event):
            webhook = self.client.post(
                self.webhook_url,
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="test_sig",
            )
        self.assertEqual(webhook.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.order_status, Order.OrderStatus.PAID)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)

        download = self.client.get(download_url)
        self.assertEqual(download.status_code, status.HTTP_200_OK)
        self.assertEqual(b"".join(download.streaming_content), payload)
        self.assertEqual(
            DownloadHistory.objects.filter(
                user=self.customer,
                product_id=product.pk,
                file_id=package.pk,
            ).count(),
            1,
        )
