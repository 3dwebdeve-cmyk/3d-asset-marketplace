"""Phase 1 regression tests: money, receipts, invoices and analytics integrity."""

from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Role, User
from analytics.services import DashboardStatsService
from mail_log.models import OutboundEmailLog
from orders.invoice import build_invoice_pdf
from orders.models import Order
from orders.notifications import deliver_payment_receipt


class _OrderFixtureMixin:
    def make_customer(self, *, full_name: str = "Test Buyer") -> User:
        role = Role.objects.get(role_name="Customer")
        return User.objects.create_user(
            email=f"buyer-{User.objects.count()}@example.com",
            full_name=full_name,
            password="Testing123!",
            role=role,
            email_verified=True,
        )

    def make_order(self, user: User, *, total: str, currency: str, paid: bool) -> Order:
        return Order.objects.create(
            user=user,
            invoice_number=f"INV-P1-{Order.objects.count() + 1:05d}",
            total_amount=Decimal(total),
            currency=currency,
            order_status=Order.OrderStatus.PAID if paid else Order.OrderStatus.PENDING,
            payment_status=Order.PaymentStatus.PAID if paid else Order.PaymentStatus.PENDING,
        )


class ReceiptDeliveryTests(_OrderFixtureMixin, TestCase):
    def test_pdf_failure_marks_the_attempt_failed(self) -> None:
        user = self.make_customer()
        order = self.make_order(user, total="10.00", currency="USD", paid=True)

        with patch("orders.notifications.build_invoice_pdf", side_effect=RuntimeError("pdf boom")):
            with self.assertRaises(RuntimeError):
                deliver_payment_receipt(order)

        log = OutboundEmailLog.objects.get(event_type="payment_receipt")
        self.assertEqual(log.status, OutboundEmailLog.Status.FAILED)
        self.assertIn("pdf boom", log.error)


class InvoiceRenderingTests(_OrderFixtureMixin, TestCase):
    def test_markup_in_customer_name_does_not_break_the_invoice(self) -> None:
        user = self.make_customer(full_name="Eve <b>& Co</b> <unclosed")
        order = self.make_order(user, total="10.00", currency="USD", paid=True)

        pdf = build_invoice_pdf(order)

        self.assertTrue(pdf.startswith(b"%PDF"))


class ConfirmCheckoutInputTests(_OrderFixtureMixin, TestCase):
    def test_non_object_json_body_is_a_validation_error(self) -> None:
        user = self.make_customer()
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post(reverse("payments:confirm"), ["not", "an", "object"], format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AnalyticsCurrencyTests(_OrderFixtureMixin, TestCase):
    def test_monthly_revenue_excludes_orders_in_other_currencies(self) -> None:
        user = self.make_customer()
        self.make_order(user, total="10.00", currency="USD", paid=True)
        self.make_order(user, total="20.00", currency="EUR", paid=True)

        stats = DashboardStatsService._current_month_sales()

        self.assertEqual(stats["currency"], "USD")
        self.assertEqual(stats["monthly_revenue"], Decimal("10.00"))
