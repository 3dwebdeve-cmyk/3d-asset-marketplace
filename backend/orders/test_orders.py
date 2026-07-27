from decimal import Decimal
from uuid import uuid4

from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from categories.models import Category
from orders.models import Order, OrderItem
from orders.services import OrderCreateData, OrderError, OrderItemCreateData, OrderService
from plugins.models import Plugin, PluginCategory
from products.models import Product


class OrderTestMixin:
    def setUp(self) -> None:
        self.customer_role = Role.objects.get(role_name="Customer")
        self.user = User.objects.create_user(
            email="order-customer@example.com",
            full_name="Order Customer",
            password="StrongPass123!",
            role=self.customer_role,
            email_verified=True,
        )
        self.category = Category.objects.create(name="Props", slug="props")
        self.product = Product.objects.create(
            category=self.category,
            name="Hero Sword",
            slug="hero-sword",
            price=Decimal("49.99"),
            discount_price=Decimal("39.99"),
            status=Product.Status.PUBLISHED,
        )
        self.draft_product = Product.objects.create(
            category=self.category,
            name="Draft Shield",
            slug="draft-shield",
            price=Decimal("19.99"),
            status=Product.Status.DRAFT,
        )
        self.plugin_category = PluginCategory.objects.create(
            name="Tools",
            slug="tools",
        )
        self.plugin = Plugin.objects.create(
            category=self.plugin_category,
            name="UV Toolkit",
            slug="uv-toolkit",
            price=Decimal("24.50"),
            status=Plugin.Status.PUBLISHED,
        )
        self.draft_plugin = Plugin.objects.create(
            category=self.plugin_category,
            name="Draft Exporter",
            slug="draft-exporter",
            price=Decimal("10.00"),
            status=Plugin.Status.DRAFT,
        )


class OrderModelConstraintTests(OrderTestMixin, TestCase):
    def test_unique_invoice_number_constraint(self) -> None:
        Order.objects.create(
            user=self.user,
            invoice_number="INV-TEST-0001",
            total_amount=Decimal("10.00"),
            currency="USD",
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            Order.objects.create(
                user=self.user,
                invoice_number="INV-TEST-0001",
                total_amount=Decimal("5.00"),
                currency="USD",
            )

    def test_unique_line_item_per_order(self) -> None:
        order = Order.objects.create(
            user=self.user,
            invoice_number="INV-TEST-0002",
            total_amount=Decimal("10.00"),
            currency="USD",
        )
        OrderItem.objects.create(
            order=order,
            product_type=OrderItem.ProductType.PRODUCT,
            product_id=self.product.pk,
            quantity=1,
            purchase_price=Decimal("10.00"),
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            OrderItem.objects.create(
                order=order,
                product_type=OrderItem.ProductType.PRODUCT,
                product_id=self.product.pk,
                quantity=2,
                purchase_price=Decimal("10.00"),
            )

    def test_database_rejects_nonpositive_quantity(self) -> None:
        order = Order.objects.create(
            user=self.user,
            invoice_number="INV-TEST-0003",
            total_amount=Decimal("10.00"),
            currency="USD",
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            OrderItem.objects.create(
                order=order,
                product_type=OrderItem.ProductType.PRODUCT,
                product_id=self.product.pk,
                quantity=0,
                purchase_price=Decimal("10.00"),
            )


class OrderServiceCreateTests(OrderTestMixin, TestCase):
    def test_create_order_with_product_and_plugin_items(self) -> None:
        order = OrderService.create(
            OrderCreateData(
                user_id=self.user.pk,
                items=(
                    OrderItemCreateData(
                        product_type=OrderItem.ProductType.PRODUCT,
                        product_id=self.product.pk,
                        quantity=2,
                    ),
                    OrderItemCreateData(
                        product_type=OrderItem.ProductType.PLUGIN,
                        product_id=self.plugin.pk,
                        quantity=1,
                    ),
                ),
            )
        )

        self.assertEqual(order.user_id, self.user.pk)
        self.assertTrue(order.invoice_number.startswith("INV-"))
        self.assertEqual(order.order_status, Order.OrderStatus.PENDING)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PENDING)
        self.assertEqual(order.currency, "USD")
        self.assertEqual(order.items.count(), 2)

        product_item = order.items.get(product_type=OrderItem.ProductType.PRODUCT)
        self.assertEqual(product_item.purchase_price, Decimal("39.99"))
        self.assertEqual(product_item.quantity, 2)

        plugin_item = order.items.get(product_type=OrderItem.ProductType.PLUGIN)
        self.assertEqual(plugin_item.purchase_price, Decimal("24.50"))

        expected_total = Decimal("39.99") * 2 + Decimal("24.50")
        self.assertEqual(order.total_amount, expected_total)
        self.assertEqual(OrderService.compute_items_total(order), expected_total)

    def test_create_rejects_empty_items(self) -> None:
        with self.assertRaises(OrderError) as exc:
            OrderService.create(
                OrderCreateData(user_id=self.user.pk, items=()),
            )
        self.assertEqual(exc.exception.field, "items")

    def test_create_rejects_invalid_product_id(self) -> None:
        with self.assertRaises(OrderError) as exc:
            OrderService.create(
                OrderCreateData(
                    user_id=self.user.pk,
                    items=(
                        OrderItemCreateData(
                            product_type=OrderItem.ProductType.PRODUCT,
                            product_id=uuid4(),
                            quantity=1,
                        ),
                    ),
                )
            )
        self.assertEqual(exc.exception.field, "items[0].product_id")
        self.assertEqual(exc.exception.message, "Product not found.")

    def test_create_rejects_invalid_plugin_id(self) -> None:
        with self.assertRaises(OrderError) as exc:
            OrderService.create(
                OrderCreateData(
                    user_id=self.user.pk,
                    items=(
                        OrderItemCreateData(
                            product_type=OrderItem.ProductType.PLUGIN,
                            product_id=uuid4(),
                            quantity=1,
                        ),
                    ),
                )
            )
        self.assertEqual(exc.exception.field, "items[0].product_id")
        self.assertEqual(exc.exception.message, "Plugin not found.")

    def test_create_rejects_unpublished_product(self) -> None:
        with self.assertRaises(OrderError) as exc:
            OrderService.create(
                OrderCreateData(
                    user_id=self.user.pk,
                    items=(
                        OrderItemCreateData(
                            product_type=OrderItem.ProductType.PRODUCT,
                            product_id=self.draft_product.pk,
                            quantity=1,
                        ),
                    ),
                )
            )
        self.assertEqual(exc.exception.message, "Product is not available for purchase.")

    def test_create_rejects_unpublished_plugin(self) -> None:
        with self.assertRaises(OrderError) as exc:
            OrderService.create(
                OrderCreateData(
                    user_id=self.user.pk,
                    items=(
                        OrderItemCreateData(
                            product_type=OrderItem.ProductType.PLUGIN,
                            product_id=self.draft_plugin.pk,
                            quantity=1,
                        ),
                    ),
                )
            )
        self.assertEqual(exc.exception.message, "Plugin is not available for purchase.")

    def test_create_rejects_duplicate_line_items(self) -> None:
        with self.assertRaises(OrderError) as exc:
            OrderService.create(
                OrderCreateData(
                    user_id=self.user.pk,
                    items=(
                        OrderItemCreateData(
                            product_type=OrderItem.ProductType.PRODUCT,
                            product_id=self.product.pk,
                            quantity=1,
                        ),
                        OrderItemCreateData(
                            product_type=OrderItem.ProductType.PRODUCT,
                            product_id=self.product.pk,
                            quantity=2,
                        ),
                    ),
                )
            )
        self.assertEqual(exc.exception.field, "items[1]")


class OrderServiceStatusTransitionTests(OrderTestMixin, TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.order = OrderService.create(
            OrderCreateData(
                user_id=self.user.pk,
                items=(
                    OrderItemCreateData(
                        product_type=OrderItem.ProductType.PRODUCT,
                        product_id=self.product.pk,
                        quantity=1,
                    ),
                ),
            )
        )

    def test_pending_to_paid_transition(self) -> None:
        updated = OrderService.update_order_status(
            self.order,
            Order.OrderStatus.PAID,
        )
        self.assertEqual(updated.order_status, Order.OrderStatus.PAID)

    def test_pending_to_cancelled_transition(self) -> None:
        updated = OrderService.update_order_status(
            self.order,
            Order.OrderStatus.CANCELLED,
        )
        self.assertEqual(updated.order_status, Order.OrderStatus.CANCELLED)

    def test_paid_to_refunded_transition(self) -> None:
        paid = OrderService.update_order_status(
            self.order,
            Order.OrderStatus.PAID,
        )
        refunded = OrderService.update_order_status(
            paid,
            Order.OrderStatus.REFUNDED,
        )
        self.assertEqual(refunded.order_status, Order.OrderStatus.REFUNDED)

    def test_invalid_order_status_transition_is_rejected(self) -> None:
        with self.assertRaises(OrderError) as exc:
            OrderService.update_order_status(
                self.order,
                Order.OrderStatus.REFUNDED,
            )
        self.assertEqual(exc.exception.field, "order_status")
        self.assertIn("Cannot transition", exc.exception.message)

    def test_payment_status_transitions(self) -> None:
        paid = OrderService.update_payment_status(
            self.order,
            Order.PaymentStatus.PAID,
        )
        self.assertEqual(paid.payment_status, Order.PaymentStatus.PAID)

        refunded = OrderService.update_payment_status(
            paid,
            Order.PaymentStatus.REFUNDED,
        )
        self.assertEqual(refunded.payment_status, Order.PaymentStatus.REFUNDED)

    def test_same_status_transition_is_idempotent(self) -> None:
        updated = OrderService.update_order_status(
            self.order,
            Order.OrderStatus.PENDING,
        )
        self.assertEqual(updated.order_status, Order.OrderStatus.PENDING)


class OrderAdminAPITests(OrderTestMixin, APITestCase):
    def setUp(self) -> None:
        super().setUp()
        cache.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.admin_user = User.objects.create_user(
            email="admin-orders@example.com",
            full_name="Admin Orders",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.other_customer = User.objects.create_user(
            email="other-order-customer@example.com",
            full_name="Other Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin_list_url = reverse("orders_admin:admin-order-list-create")
        self.admin_login_url = reverse("accounts:admin-login")
        self.customer_login_url = reverse("accounts:login")
        self.order = OrderService.create(
            OrderCreateData(
                user_id=self.user.pk,
                items=(
                    OrderItemCreateData(
                        product_type=OrderItem.ProductType.PRODUCT,
                        product_id=self.product.pk,
                        quantity=2,
                    ),
                    OrderItemCreateData(
                        product_type=OrderItem.ProductType.PLUGIN,
                        product_id=self.plugin.pk,
                        quantity=1,
                    ),
                ),
            )
        )

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
            self.customer_login_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_admin_list_returns_created_order(self) -> None:
        self._authenticate_admin()
        response = self.client.get(self.admin_list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        item = response.data["results"][0]
        self.assertEqual(item["id"], str(self.order.id))
        self.assertEqual(item["invoice_number"], self.order.invoice_number)
        self.assertEqual(item["customer"]["email"], self.user.email)
        self.assertEqual(item["item_count"], 2)

    def test_admin_list_filters_by_order_status(self) -> None:
        self._authenticate_admin()
        pending = self.client.get(
            self.admin_list_url,
            {"order_status": Order.OrderStatus.PENDING},
        )
        self.assertEqual(pending.status_code, status.HTTP_200_OK)
        self.assertEqual(pending.data["count"], 1)

        paid = self.client.get(
            self.admin_list_url,
            {"order_status": Order.OrderStatus.PAID},
        )
        self.assertEqual(paid.status_code, status.HTTP_200_OK)
        self.assertEqual(paid.data["count"], 0)

    def test_admin_list_filters_by_payment_status_and_customer_id(self) -> None:
        self._authenticate_admin()
        by_payment = self.client.get(
            self.admin_list_url,
            {"payment_status": Order.PaymentStatus.PENDING},
        )
        self.assertEqual(by_payment.status_code, status.HTTP_200_OK)
        self.assertEqual(by_payment.data["count"], 1)

        by_customer = self.client.get(
            self.admin_list_url,
            {"customer_id": str(self.user.id)},
        )
        self.assertEqual(by_customer.status_code, status.HTTP_200_OK)
        self.assertEqual(by_customer.data["count"], 1)

        other_customer = self.client.get(
            self.admin_list_url,
            {"customer_id": str(self.other_customer.id)},
        )
        self.assertEqual(other_customer.status_code, status.HTTP_200_OK)
        self.assertEqual(other_customer.data["count"], 0)

    def test_admin_list_search_by_email_and_invoice_number(self) -> None:
        self._authenticate_admin()
        by_email = self.client.get(
            self.admin_list_url,
            {"search": self.user.email},
        )
        self.assertEqual(by_email.status_code, status.HTTP_200_OK)
        self.assertEqual(by_email.data["count"], 1)

        by_invoice = self.client.get(
            self.admin_list_url,
            {"search": self.order.invoice_number},
        )
        self.assertEqual(by_invoice.status_code, status.HTTP_200_OK)
        self.assertEqual(by_invoice.data["count"], 1)

        no_match = self.client.get(
            self.admin_list_url,
            {"search": "no-such-order@example.com"},
        )
        self.assertEqual(no_match.status_code, status.HTTP_200_OK)
        self.assertEqual(no_match.data["count"], 0)

    def test_admin_detail_includes_items_customer_and_live_titles(self) -> None:
        self._authenticate_admin()
        detail_url = reverse(
            "orders_admin:admin-order-detail",
            kwargs={"order_id": self.order.id},
        )
        response = self.client.get(detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(self.order.id))
        self.assertEqual(response.data["customer"]["email"], self.user.email)
        self.assertEqual(len(response.data["items"]), 2)

        titles = {item["title"] for item in response.data["items"]}
        self.assertEqual(titles, {"Hero Sword", "UV Toolkit"})

        product_item = next(
            item
            for item in response.data["items"]
            if item["product_type"] == OrderItem.ProductType.PRODUCT
        )
        self.assertEqual(product_item["quantity"], 2)
        self.assertEqual(product_item["purchase_price"], "39.99")
        self.assertEqual(product_item["line_total"], "79.98")

    def test_customer_denied_on_admin_order_endpoints(self) -> None:
        self._authenticate_customer()
        list_response = self.client.get(self.admin_list_url)
        self.assertEqual(list_response.status_code, status.HTTP_403_FORBIDDEN)

        detail_url = reverse(
            "orders_admin:admin-order-detail",
            kwargs={"order_id": self.order.id},
        )
        detail_response = self.client.get(detail_url)
        self.assertEqual(detail_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_order_detail_returns_404_for_missing_order(self) -> None:
        self._authenticate_admin()
        detail_url = reverse(
            "orders_admin:admin-order-detail",
            kwargs={"order_id": uuid4()},
        )
        response = self.client.get(detail_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_can_create_order_via_api(self) -> None:
        self._authenticate_admin()
        response = self.client.post(
            self.admin_list_url,
            {
                "customer_id": str(self.user.id),
                "items": [
                    {
                        "product_type": OrderItem.ProductType.PRODUCT,
                        "product_id": str(self.product.id),
                        "quantity": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["customer"]["email"], self.user.email)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["title"], "Hero Sword")
