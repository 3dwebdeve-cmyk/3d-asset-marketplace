from decimal import Decimal

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category
from orders.models import Order, OrderItem
from payments.models import Payment
from products.models import Product


class AdminPaymentsAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")

        self.admin_user = User.objects.create_user(
            email="admin-payments@example.com",
            full_name="Admin Payments",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])

        self.customer = User.objects.create_user(
            email="payer@example.com",
            full_name="Payer Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.other_customer = User.objects.create_user(
            email="buyer2@example.com",
            full_name="Other Payer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )

        self.category = Category.objects.create(name="Props", slug="props")
        self.product = Product.objects.create(
            category=self.category,
            name="Hero Sword",
            slug="hero-sword",
            price=Decimal("49.99"),
            status=Product.Status.PUBLISHED,
        )

        self.order = self._create_order(
            user=self.customer,
            invoice_number="INV-20260731-PAY1",
            total=Decimal("49.99"),
        )
        self.other_order = self._create_order(
            user=self.other_customer,
            invoice_number="INV-20260731-PAY2",
            total=Decimal("19.99"),
        )

        self.succeeded_payment = Payment.objects.create(
            order=self.order,
            stripe_checkout_session_id="cs_test_succeeded_1",
            stripe_payment_intent_id="pi_test_succeeded_1",
            amount=Decimal("49.99"),
            currency="USD",
            status=Payment.Status.SUCCEEDED,
        )
        self.pending_payment = Payment.objects.create(
            order=self.other_order,
            stripe_checkout_session_id="cs_test_pending_1",
            amount=Decimal("19.99"),
            currency="USD",
            status=Payment.Status.PENDING,
        )

        self.list_url = reverse("payments_admin:admin-payment-list")
        self.detail_url = reverse(
            "payments_admin:admin-payment-detail",
            kwargs={"payment_id": self.succeeded_payment.id},
        )
        self.admin_login_url = reverse("accounts:admin-login")
        self.customer_login_url = reverse("accounts:login")

    def _create_order(self, *, user: User, invoice_number: str, total: Decimal) -> Order:
        order = Order.objects.create(
            user=user,
            invoice_number=invoice_number,
            total_amount=total,
            currency="USD",
            order_status=Order.OrderStatus.PENDING,
            payment_status=Order.PaymentStatus.PENDING,
        )
        OrderItem.objects.create(
            order=order,
            product_type=OrderItem.ProductType.PRODUCT,
            product_id=self.product.id,
            title=self.product.name,
            slug=self.product.slug,
            quantity=1,
            purchase_price=total,
        )
        return order

    def _authenticate_as_admin(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _authenticate_as_customer(self) -> None:
        response = self.client.post(
            self.customer_login_url,
            {"email": self.customer.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_guest_cannot_list_payments(self) -> None:
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customer_cannot_list_or_detail_payments(self) -> None:
        self._authenticate_as_customer()
        list_response = self.client.get(self.list_url)
        self.assertEqual(list_response.status_code, status.HTTP_403_FORBIDDEN)

        detail_response = self.client.get(self.detail_url)
        self.assertEqual(detail_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_lists_payments(self) -> None:
        self._authenticate_as_admin()
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        ids = {row["id"] for row in response.data["results"]}
        self.assertIn(str(self.succeeded_payment.id), ids)
        self.assertIn(str(self.pending_payment.id), ids)
        first = next(
            row
            for row in response.data["results"]
            if row["id"] == str(self.succeeded_payment.id)
        )
        self.assertEqual(first["customer_email"], self.customer.email)
        self.assertEqual(first["invoice_number"], self.order.invoice_number)
        self.assertEqual(first["order_id"], str(self.order.id))
        self.assertEqual(first["amount"], "49.99")
        self.assertEqual(first["status"], Payment.Status.SUCCEEDED)
        self.assertEqual(first["stripe_checkout_session_id"], "cs_test_succeeded_1")
        self.assertEqual(first["stripe_payment_intent_id"], "pi_test_succeeded_1")
        self.assertNotIn("stripe_secret", first)
        self.assertNotIn("secret_key", first)

    def test_admin_filters_by_status_aliases_and_search(self) -> None:
        self._authenticate_as_admin()

        paid = self.client.get(self.list_url, {"status": "paid"})
        self.assertEqual(paid.status_code, status.HTTP_200_OK)
        self.assertEqual(paid.data["count"], 1)
        self.assertEqual(paid.data["results"][0]["id"], str(self.succeeded_payment.id))

        pending = self.client.get(self.list_url, {"status": "pending"})
        self.assertEqual(pending.status_code, status.HTTP_200_OK)
        self.assertEqual(pending.data["count"], 1)
        self.assertEqual(pending.data["results"][0]["id"], str(self.pending_payment.id))

        by_email = self.client.get(self.list_url, {"search": "payer@example.com"})
        self.assertEqual(by_email.status_code, status.HTTP_200_OK)
        self.assertEqual(by_email.data["count"], 1)
        self.assertEqual(by_email.data["results"][0]["id"], str(self.succeeded_payment.id))

        by_invoice = self.client.get(self.list_url, {"search": "PAY2"})
        self.assertEqual(by_invoice.status_code, status.HTTP_200_OK)
        self.assertEqual(by_invoice.data["count"], 1)
        self.assertEqual(
            by_invoice.data["results"][0]["id"],
            str(self.pending_payment.id),
        )

        invalid = self.client.get(self.list_url, {"status": "not-a-status"})
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", invalid.data)

    def test_admin_filters_by_date_range(self) -> None:
        self._authenticate_as_admin()
        response = self.client.get(
            self.list_url,
            {"created_after": "2020-01-01", "created_before": "2099-12-31"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

        empty = self.client.get(self.list_url, {"created_after": "2099-01-01"})
        self.assertEqual(empty.status_code, status.HTTP_200_OK)
        self.assertEqual(empty.data["count"], 0)

        bad = self.client.get(self.list_url, {"created_after": "not-a-date"})
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("created_after", bad.data)

    def test_admin_payment_detail_links_order(self) -> None:
        self._authenticate_as_admin()
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(self.succeeded_payment.id))
        self.assertEqual(response.data["customer_email"], self.customer.email)
        self.assertEqual(response.data["order"]["id"], str(self.order.id))
        self.assertEqual(
            response.data["order"]["invoice_number"],
            self.order.invoice_number,
        )
        self.assertEqual(response.data["stripe_checkout_session_id"], "cs_test_succeeded_1")
        self.assertEqual(response.data["stripe_payment_intent_id"], "pi_test_succeeded_1")
        self.assertNotIn("secret", str(response.data).lower())

        missing = self.client.get(
            reverse(
                "payments_admin:admin-payment-detail",
                kwargs={"payment_id": "11111111-1111-1111-1111-111111111111"},
            )
        )
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)
