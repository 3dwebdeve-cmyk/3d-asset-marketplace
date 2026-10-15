"""License certificates, public verification, and download spike alerts."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category
from downloads.models import DownloadHistory
from downloads.services import DownloadService
from orders.license import LICENSE_CODE_RE
from orders.models import Order, OrderItem
from orders.services import OrderCreateData, OrderItemCreateData, OrderService
from products.models import Product


class LicenseCertificateTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        customer_role = Role.objects.get(role_name="Customer")
        self.buyer = User.objects.create_user(
            email="licensee@example.com",
            full_name="Ada <b>Licensee</b>",
            password="StrongPass123!",
            role=customer_role,
            email_verified=True,
        )
        self.other = User.objects.create_user(
            email="someone-else@example.com",
            full_name="Someone Else",
            password="StrongPass123!",
            role=customer_role,
            email_verified=True,
        )
        category = Category.objects.create(name="Chairs", slug="chairs")
        self.product = Product.objects.create(
            category=category,
            name="Oak Chair",
            slug="oak-chair",
            price=Decimal("20.00"),
            license_type=Product.LicenseType.EXTENDED,
            status=Product.Status.PUBLISHED,
        )

    def _order(self, *, paid: bool = True) -> Order:
        order = OrderService.create(
            OrderCreateData(
                user_id=self.buyer.pk,
                items=(
                    OrderItemCreateData(
                        product_type="product", product_id=self.product.pk, quantity=1
                    ),
                ),
                currency="USD",
            )
        )
        if paid:
            OrderService.update_order_status(order, Order.OrderStatus.PAID)
            order = OrderService.update_payment_status(order, Order.PaymentStatus.PAID)
        return order

    def _license_url(self, order: Order) -> str:
        item = order.items.get()
        return reverse(
            "orders:order-item-license", kwargs={"order_id": order.pk, "item_id": item.pk}
        )

    def test_owner_gets_pdf_and_code_is_stable(self) -> None:
        order = self._order()
        self.client.force_authenticate(self.buyer)

        first = self.client.get(self._license_url(order))
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first["Content-Type"], "application/pdf")
        self.assertTrue(b"".join(first.streaming_content).startswith(b"%PDF"))

        item = order.items.get()
        self.assertRegex(item.license_code, LICENSE_CODE_RE)
        self.assertEqual(item.license_type, "extended")
        self.assertIn(item.license_code, first["Content-Disposition"])

        second = self.client.get(self._license_url(order))
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(order.items.get().license_code, item.license_code)

    def test_other_customer_gets_404(self) -> None:
        order = self._order()
        self.client.force_authenticate(self.other)
        response = self.client.get(self._license_url(order))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIsNone(order.items.get().license_code)

    def test_unpaid_order_gets_403(self) -> None:
        order = self._order(paid=False)
        self.client.force_authenticate(self.buyer)
        response = self.client.get(self._license_url(order))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_verify_returns_no_buyer_data_and_tracks_refunds(self) -> None:
        order = self._order()
        self.client.force_authenticate(self.buyer)
        self.client.get(self._license_url(order))
        code = order.items.get().license_code
        self.client.force_authenticate(None)

        verify_url = reverse("license-verify", kwargs={"code": code.lower()})
        response = self.client.get(verify_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "active")
        self.assertEqual(response.data["product_title"], "Oak Chair")
        body = str(response.data)
        self.assertNotIn("licensee@example.com", body)
        self.assertNotIn("Licensee", body)

        OrderService.update_payment_status(order, Order.PaymentStatus.REFUNDED)
        self.assertEqual(self.client.get(verify_url).data["status"], "revoked")

    def test_verify_unknown_or_malformed_code_is_404(self) -> None:
        for code in ("LIC-0000-0000-0000-0000", "not-a-code", "LIC-IIII-LLLL-OOOO-UUUU"):
            with self.subTest(code=code):
                response = self.client.get(reverse("license-verify", kwargs={"code": code}))
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_order_search_finds_license_code(self) -> None:
        order = self._order()
        self.client.force_authenticate(self.buyer)
        self.client.get(self._license_url(order))
        code = order.items.get().license_code

        results = OrderService.list_admin(search=code.lower())
        self.assertEqual([row.pk for row in results], [order.pk])


class DownloadSpikeAlertTests(APITestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            email="busy-buyer@example.com",
            full_name="Busy Buyer",
            password="StrongPass123!",
            role=Role.objects.get(role_name="Customer"),
            email_verified=True,
        )

    def _history(self, count: int) -> None:
        DownloadHistory.objects.bulk_create(
            DownloadHistory(
                user=self.user,
                product_type="product",
                product_id=self.user.pk,
                file_id=self.user.pk,
                file_name="package.zip",
            )
            for _ in range(count)
        )

    @override_settings(DOWNLOAD_ALERT_LINKS_PER_HOUR=3)
    @patch("downloads.services.capture_download_spike")
    def test_alerts_once_when_threshold_is_crossed(self, capture) -> None:
        self._history(2)
        DownloadService._alert_on_download_spike(self.user)
        capture.assert_not_called()

        self._history(1)
        DownloadService._alert_on_download_spike(self.user)
        capture.assert_called_once_with(user_id=str(self.user.pk), links_last_hour=3)

        self._history(1)
        DownloadService._alert_on_download_spike(self.user)
        capture.assert_called_once()

    @override_settings(DOWNLOAD_ALERT_LINKS_PER_HOUR=0)
    @patch("downloads.services.capture_download_spike")
    def test_zero_disables_the_alert(self, capture) -> None:
        self._history(5)
        DownloadService._alert_on_download_spike(self.user)
        capture.assert_not_called()


class OrderItemSerializerTests(APITestCase):
    def test_license_code_is_read_only_field(self) -> None:
        from orders.serializers import OrderItemDetailSerializer

        self.assertIn("license_code", OrderItemDetailSerializer.Meta.read_only_fields)
        self.assertFalse(OrderItem._meta.get_field("license_code").editable)
