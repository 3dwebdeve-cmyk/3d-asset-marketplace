from datetime import datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category
from orders.models import Order, OrderItem
from payments.models import Payment
from plugins.models import Plugin, PluginCategory
from products.models import Product


class AdminAnalyticsAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.customer_role = Role.objects.get(role_name="Customer")

        self.admin_user = User.objects.create_user(
            email="admin-analytics@example.com",
            full_name="Admin Analytics",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])

        self.customer_user = User.objects.create_user(
            email="customer-analytics@example.com",
            full_name="Customer Analytics",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )

        self.category = Category.objects.create(name="Props", slug="props-analytics")
        self.product = Product.objects.create(
            category=self.category,
            name="Oak Chair",
            slug="oak-chair-analytics",
            price=Decimal("40.00"),
            status=Product.Status.PUBLISHED,
        )
        plugin_category = PluginCategory.objects.create(
            name="Tools Analytics",
            slug="tools-analytics",
        )
        self.plugin = Plugin.objects.create(
            category=plugin_category,
            name="Mesh Toolkit",
            slug="mesh-toolkit-analytics",
            price=Decimal("20.00"),
            status=Plugin.Status.PUBLISHED,
        )

        self.analytics_url = reverse("analytics:admin-analytics")
        self.stats_url = reverse("analytics_admin:admin-dashboard-stats")
        self.admin_login_url = reverse("accounts:admin-login")

        today = timezone.localdate()
        self.range_start = today.replace(day=1).isoformat()
        self.range_end = today.isoformat()

        self.paid_order = self._create_order(
            invoice_number="INV-ANALYTICS-PAID",
            total=Decimal("100.00"),
            payment_status=Order.PaymentStatus.PAID,
            order_status=Order.OrderStatus.PAID,
        )
        OrderItem.objects.create(
            order=self.paid_order,
            product_type=OrderItem.ProductType.PRODUCT,
            product_id=self.product.id,
            title=self.product.name,
            slug=self.product.slug,
            quantity=2,
            purchase_price=Decimal("40.00"),
        )
        OrderItem.objects.create(
            order=self.paid_order,
            product_type=OrderItem.ProductType.PLUGIN,
            product_id=self.plugin.id,
            title=self.plugin.name,
            slug=self.plugin.slug,
            quantity=1,
            purchase_price=Decimal("20.00"),
        )
        Payment.objects.create(
            order=self.paid_order,
            gateway="stripe",
            stripe_checkout_session_id=f"cs_test_{uuid4().hex}",
            amount=Decimal("100.00"),
            currency="USD",
            status=Payment.Status.SUCCEEDED,
        )

        self.pending_order = self._create_order(
            invoice_number="INV-ANALYTICS-PENDING",
            total=Decimal("40.00"),
            payment_status=Order.PaymentStatus.PENDING,
            order_status=Order.OrderStatus.PENDING,
        )
        OrderItem.objects.create(
            order=self.pending_order,
            product_type=OrderItem.ProductType.PRODUCT,
            product_id=self.product.id,
            title=self.product.name,
            slug=self.product.slug,
            quantity=1,
            purchase_price=Decimal("40.00"),
        )

    def _create_order(
        self,
        *,
        invoice_number: str,
        total: Decimal,
        payment_status: str,
        order_status: str,
    ) -> Order:
        return Order.objects.create(
            user=self.customer_user,
            invoice_number=invoice_number,
            total_amount=total,
            currency="USD",
            payment_status=payment_status,
            order_status=order_status,
        )

    def _authenticate_as_admin(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_analytics_requires_administrator(self) -> None:
        response = self.client.get(self.analytics_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        login = self.client.post(
            reverse("accounts:login"),
            {"email": self.customer_user.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        response = self.client.get(self.analytics_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_analytics_returns_order_metrics_and_gateway_shape(self) -> None:
        self._authenticate_as_admin()

        response = self.client.get(
            self.analytics_url,
            {"start_date": self.range_start, "end_date": self.range_end},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["filters"]["start_date"], self.range_start)
        self.assertEqual(response.data["filters"]["end_date"], self.range_end)
        self.assertEqual(response.data["currency"], "USD")
        self.assertEqual(response.data["summary"]["order_count"], 2)
        self.assertEqual(response.data["summary"]["paid_order_count"], 1)
        self.assertEqual(response.data["summary"]["pending_order_count"], 1)
        self.assertEqual(response.data["summary"]["revenue"], "100.00")
        self.assertEqual(response.data["summary"]["average_order_value"], "100.00")
        self.assertGreaterEqual(len(response.data["revenue_by_period"]), 1)
        self.assertEqual(len(response.data["top_products"]), 1)
        self.assertEqual(response.data["top_products"][0]["title"], "Oak Chair")
        self.assertEqual(response.data["top_products"][0]["quantity_sold"], 2)
        self.assertEqual(response.data["top_products"][0]["revenue"], "80.00")
        self.assertEqual(len(response.data["top_plugins"]), 1)
        self.assertEqual(response.data["top_plugins"][0]["title"], "Mesh Toolkit")
        self.assertEqual(response.data["top_plugins"][0]["revenue"], "20.00")
        self.assertIn("gateway_breakdown", response.data)
        self.assertEqual(len(response.data["gateway_breakdown"]), 1)
        self.assertEqual(response.data["gateway_breakdown"][0]["gateway"], "stripe")
        self.assertEqual(response.data["gateway_breakdown"][0]["payment_count"], 1)
        self.assertEqual(response.data["gateway_breakdown"][0]["revenue"], "100.00")

    def test_analytics_date_filters_exclude_out_of_range(self) -> None:
        self._authenticate_as_admin()
        old_day = timezone.localdate() - timedelta(days=60)
        old_order = self._create_order(
            invoice_number="INV-ANALYTICS-OLD",
            total=Decimal("50.00"),
            payment_status=Order.PaymentStatus.PAID,
            order_status=Order.OrderStatus.PAID,
        )
        Order.objects.filter(pk=old_order.pk).update(
            created_at=timezone.make_aware(datetime.combine(old_day, datetime.min.time()))
        )

        response = self.client.get(
            self.analytics_url,
            {"start_date": self.range_start, "end_date": self.range_end},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["paid_order_count"], 1)
        self.assertEqual(response.data["summary"]["revenue"], "100.00")

    def test_analytics_rejects_invalid_date_range(self) -> None:
        self._authenticate_as_admin()

        bad_date = self.client.get(
            self.analytics_url,
            {"start_date": "not-a-date"},
        )
        self.assertEqual(bad_date.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("start_date", bad_date.data)

        inverted = self.client.get(
            self.analytics_url,
            {"start_date": self.range_end, "end_date": self.range_start},
        )
        # Only fails when end < start; equal dates are ok. Use a later start.
        if self.range_start != self.range_end:
            self.assertEqual(inverted.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("start_date", inverted.data)
        else:
            later = (timezone.localdate() + timedelta(days=1)).isoformat()
            inverted = self.client.get(
                self.analytics_url,
                {"start_date": later, "end_date": self.range_end},
            )
            self.assertEqual(inverted.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("start_date", inverted.data)

        too_wide = self.client.get(
            self.analytics_url,
            {"start_date": "2020-01-01", "end_date": "2022-01-02"},
        )
        self.assertEqual(too_wide.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_date", too_wide.data)

    def test_dashboard_sales_use_paid_orders_for_current_month(self) -> None:
        self._authenticate_as_admin()

        response = self.client.get(self.stats_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["sales"]["monthly_revenue"], "100.00")
        self.assertEqual(response.data["sales"]["monthly_orders"], 1)
        self.assertEqual(response.data["sales"]["currency"], "USD")
        self.assertEqual(response.data["payments"]["succeeded"], 1)
