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
        self.assertEqual(product_item.title, "Hero Sword")
        self.assertEqual(product_item.slug, "hero-sword")

        plugin_item = order.items.get(product_type=OrderItem.ProductType.PLUGIN)
        self.assertEqual(plugin_item.purchase_price, Decimal("24.50"))
        self.assertEqual(plugin_item.title, "UV Toolkit")
        self.assertEqual(plugin_item.slug, "uv-toolkit")

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

    def test_create_rejects_non_customer_user(self) -> None:
        admin_role = Role.objects.get(role_name="Administrator")
        admin_user = User.objects.create_user(
            email="order-admin-customer@example.com",
            full_name="Not A Customer",
            password="StrongPass123!",
            role=admin_role,
            email_verified=True,
        )
        with self.assertRaises(OrderError) as exc:
            OrderService.create(
                OrderCreateData(
                    user_id=admin_user.pk,
                    items=(
                        OrderItemCreateData(
                            product_type=OrderItem.ProductType.PRODUCT,
                            product_id=self.product.pk,
                            quantity=1,
                        ),
                    ),
                )
            )
        self.assertEqual(exc.exception.field, "user_id")
        self.assertIn("customer", exc.exception.message.lower())


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

    def test_admin_detail_includes_items_customer_and_snapshotted_titles(self) -> None:
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
        slugs = {item["slug"] for item in response.data["items"]}
        self.assertEqual(titles, {"Hero Sword", "UV Toolkit"})
        self.assertEqual(slugs, {"hero-sword", "uv-toolkit"})

        product_item = next(
            item
            for item in response.data["items"]
            if item["product_type"] == OrderItem.ProductType.PRODUCT
        )
        self.assertEqual(product_item["quantity"], 2)
        self.assertEqual(product_item["purchase_price"], "39.99")
        self.assertEqual(product_item["line_total"], "79.98")

        # Renaming catalog rows must not change snapshotted order titles.
        self.product.name = "Renamed Sword"
        self.product.slug = "renamed-sword"
        self.product.save(update_fields=["name", "slug", "updated_at"])
        renamed = self.client.get(detail_url)
        self.assertEqual(renamed.status_code, status.HTTP_200_OK)
        renamed_titles = {item["title"] for item in renamed.data["items"]}
        self.assertEqual(renamed_titles, {"Hero Sword", "UV Toolkit"})

    def test_admin_can_patch_allowed_status_transitions(self) -> None:
        self._authenticate_admin()
        detail_url = reverse(
            "orders_admin:admin-order-detail",
            kwargs={"order_id": self.order.id},
        )
        response = self.client.patch(
            detail_url,
            {
                "order_status": Order.OrderStatus.PAID,
                "payment_status": Order.PaymentStatus.PAID,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["order_status"], Order.OrderStatus.PAID)
        self.assertEqual(response.data["payment_status"], Order.PaymentStatus.PAID)

        refund = self.client.patch(
            detail_url,
            {"order_status": Order.OrderStatus.REFUNDED},
            format="json",
        )
        self.assertEqual(refund.status_code, status.HTTP_200_OK)
        self.assertEqual(refund.data["order_status"], Order.OrderStatus.REFUNDED)

    def test_admin_patch_rejects_illegal_status_transition(self) -> None:
        self._authenticate_admin()
        detail_url = reverse(
            "orders_admin:admin-order-detail",
            kwargs={"order_id": self.order.id},
        )
        response = self.client.patch(
            detail_url,
            {"order_status": Order.OrderStatus.REFUNDED},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("order_status", response.data)

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
        self.assertEqual(response.data["items"][0]["slug"], "hero-sword")
        created_item = OrderItem.objects.get(id=response.data["items"][0]["id"])
        self.assertEqual(created_item.title, "Hero Sword")
        self.assertEqual(created_item.slug, "hero-sword")

    def test_unauthenticated_denied_on_admin_order_endpoints(self) -> None:
        list_response = self.client.get(self.admin_list_url)
        self.assertEqual(list_response.status_code, status.HTTP_401_UNAUTHORIZED)

        detail_url = reverse(
            "orders_admin:admin-order-detail",
            kwargs={"order_id": self.order.id},
        )
        detail_response = self.client.get(detail_url)
        self.assertEqual(detail_response.status_code, status.HTTP_401_UNAUTHORIZED)

        create_response = self.client.post(
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
        self.assertEqual(create_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_list_rejects_invalid_order_status_filter(self) -> None:
        self._authenticate_admin()
        response = self.client.get(
            self.admin_list_url,
            {"order_status": "not-a-status"},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("order_status", response.data)

    def test_admin_list_rejects_invalid_customer_id_filter(self) -> None:
        self._authenticate_admin()
        response = self.client.get(
            self.admin_list_url,
            {"customer_id": "not-a-uuid"},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("customer_id", response.data)

    def test_admin_create_rejects_non_customer_user(self) -> None:
        self._authenticate_admin()
        response = self.client.post(
            self.admin_list_url,
            {
                "customer_id": str(self.admin_user.id),
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
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("user_id", response.data)

    def test_admin_create_rejects_invalid_currency(self) -> None:
        self._authenticate_admin()
        response = self.client.post(
            self.admin_list_url,
            {
                "customer_id": str(self.user.id),
                "currency": "US",
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
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("currency", response.data)

    def test_admin_create_rejects_unpublished_product(self) -> None:
        self._authenticate_admin()
        response = self.client.post(
            self.admin_list_url,
            {
                "customer_id": str(self.user.id),
                "items": [
                    {
                        "product_type": OrderItem.ProductType.PRODUCT,
                        "product_id": str(self.draft_product.id),
                        "quantity": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class OrderCustomerAPITests(OrderTestMixin, APITestCase):
    LIST_FIELDS = {
        "id",
        "invoice_number",
        "total_amount",
        "currency",
        "order_status",
        "payment_status",
        "item_count",
        "created_at",
        "updated_at",
    }

    ITEM_FIELDS = {
        "id",
        "product_type",
        "product_id",
        "title",
        "slug",
        "quantity",
        "purchase_price",
        "line_total",
        "can_download",
        "files",
        "created_at",
        "updated_at",
    }

    def setUp(self) -> None:
        super().setUp()
        cache.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.admin_user = User.objects.create_user(
            email="admin-customer-orders@example.com",
            full_name="Admin Customer Orders",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.other_customer = User.objects.create_user(
            email="other-customer-orders@example.com",
            full_name="Other Customer Orders",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.list_url = reverse("orders:order-list")
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
        self.detail_url = reverse(
            "orders:order-detail",
            kwargs={"order_id": self.order.id},
        )

    def _authenticate_admin(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _authenticate_customer(self, user: User | None = None) -> None:
        target = user or self.user
        response = self.client.post(
            self.customer_login_url,
            {"email": target.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_unauthenticated_list_and_detail_return_401(self) -> None:
        list_response = self.client.get(self.list_url)
        self.assertEqual(list_response.status_code, status.HTTP_401_UNAUTHORIZED)

        detail_response = self.client.get(self.detail_url)
        self.assertEqual(detail_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_customer_list_returns_only_own_orders(self) -> None:
        self._authenticate_customer()
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(self.order.id))

        OrderService.create(
            OrderCreateData(
                user_id=self.other_customer.pk,
                items=(
                    OrderItemCreateData(
                        product_type=OrderItem.ProductType.PRODUCT,
                        product_id=self.product.pk,
                        quantity=1,
                    ),
                ),
            )
        )

        scoped = self.client.get(self.list_url)
        self.assertEqual(scoped.status_code, status.HTTP_200_OK)
        self.assertEqual(scoped.data["count"], 1)
        self.assertEqual(scoped.data["results"][0]["id"], str(self.order.id))

    def test_customer_list_includes_admin_created_order(self) -> None:
        self._authenticate_admin()
        admin_response = self.client.post(
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
        self.assertEqual(admin_response.status_code, status.HTTP_201_CREATED)
        admin_created_id = admin_response.data["id"]

        self._authenticate_customer()
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order_ids = {item["id"] for item in response.data["results"]}
        self.assertIn(admin_created_id, order_ids)

    def test_customer_detail_own_order_returns_200(self) -> None:
        self._authenticate_customer()
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(self.order.id))
        self.assertEqual(response.data["invoice_number"], self.order.invoice_number)
        self.assertEqual(len(response.data["items"]), 2)

    def test_customer_detail_other_users_order_returns_404(self) -> None:
        other_order = OrderService.create(
            OrderCreateData(
                user_id=self.other_customer.pk,
                items=(
                    OrderItemCreateData(
                        product_type=OrderItem.ProductType.PRODUCT,
                        product_id=self.product.pk,
                        quantity=1,
                    ),
                ),
            )
        )
        self._authenticate_customer()
        other_detail_url = reverse(
            "orders:order-detail",
            kwargs={"order_id": other_order.id},
        )
        response = self.client.get(other_detail_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_detail_unknown_order_returns_404(self) -> None:
        self._authenticate_customer()
        unknown_url = reverse(
            "orders:order-detail",
            kwargs={"order_id": uuid4()},
        )
        response = self.client.get(unknown_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_list_pagination(self) -> None:
        for _ in range(24):
            OrderService.create(
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

        self._authenticate_customer()
        page_one = self.client.get(self.list_url, {"page": 1, "page_size": 20})
        self.assertEqual(page_one.status_code, status.HTTP_200_OK)
        self.assertEqual(page_one.data["count"], 25)
        self.assertEqual(len(page_one.data["results"]), 20)
        self.assertIsNotNone(page_one.data["next"])
        self.assertIsNone(page_one.data["previous"])

        page_two = self.client.get(self.list_url, {"page": 2, "page_size": 20})
        self.assertEqual(page_two.status_code, status.HTTP_200_OK)
        self.assertEqual(len(page_two.data["results"]), 5)
        self.assertIsNone(page_two.data["next"])
        self.assertIsNotNone(page_two.data["previous"])

        page_one_ids = {item["id"] for item in page_one.data["results"]}
        page_two_ids = {item["id"] for item in page_two.data["results"]}
        self.assertTrue(page_one_ids.isdisjoint(page_two_ids))

    def test_customer_list_filters_by_order_status(self) -> None:
        self._authenticate_customer()
        pending = self.client.get(
            self.list_url,
            {"order_status": Order.OrderStatus.PENDING},
        )
        self.assertEqual(pending.status_code, status.HTTP_200_OK)
        self.assertEqual(pending.data["count"], 1)

        paid = self.client.get(
            self.list_url,
            {"order_status": Order.OrderStatus.PAID},
        )
        self.assertEqual(paid.status_code, status.HTTP_200_OK)
        self.assertEqual(paid.data["count"], 0)

        invalid = self.client.get(
            self.list_url,
            {"order_status": "not-a-status"},
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("order_status", invalid.data)

    def test_customer_list_filters_by_payment_status(self) -> None:
        self._authenticate_customer()
        pending = self.client.get(
            self.list_url,
            {"payment_status": Order.PaymentStatus.PENDING},
        )
        self.assertEqual(pending.status_code, status.HTTP_200_OK)
        self.assertEqual(pending.data["count"], 1)

        paid = self.client.get(
            self.list_url,
            {"payment_status": Order.PaymentStatus.PAID},
        )
        self.assertEqual(paid.status_code, status.HTTP_200_OK)
        self.assertEqual(paid.data["count"], 0)

        invalid = self.client.get(
            self.list_url,
            {"payment_status": "not-a-status"},
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("payment_status", invalid.data)

    def test_customer_list_search_by_invoice_number(self) -> None:
        self._authenticate_customer()
        partial = self.order.invoice_number[-6:]
        response = self.client.get(self.list_url, {"search": partial})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(self.order.id))

        no_match = self.client.get(self.list_url, {"search": "INV-NO-SUCH-ORDER"})
        self.assertEqual(no_match.status_code, status.HTTP_200_OK)
        self.assertEqual(no_match.data["count"], 0)

    def test_customer_list_ordering(self) -> None:
        low_total = OrderService.create(
            OrderCreateData(
                user_id=self.user.pk,
                items=(
                    OrderItemCreateData(
                        product_type=OrderItem.ProductType.PLUGIN,
                        product_id=self.plugin.pk,
                        quantity=1,
                    ),
                ),
            )
        )
        self.order.total_amount = Decimal("999.99")
        self.order.save(update_fields=["total_amount", "updated_at"])

        self._authenticate_customer()
        ascending = self.client.get(self.list_url, {"ordering": "total_amount"})
        self.assertEqual(ascending.status_code, status.HTTP_200_OK)
        totals = [Decimal(item["total_amount"]) for item in ascending.data["results"]]
        self.assertEqual(totals, sorted(totals))
        self.assertEqual(ascending.data["results"][0]["id"], str(low_total.id))

    def test_customer_list_response_schema(self) -> None:
        self._authenticate_customer()
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data["results"][0]
        self.assertEqual(set(item.keys()), self.LIST_FIELDS)
        self.assertNotIn("customer", item)
        self.assertNotIn("user_id", item)

    def test_customer_detail_response_schema(self) -> None:
        self._authenticate_customer()
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        detail_fields = self.LIST_FIELDS | {"items", "items_total"}
        self.assertEqual(set(response.data.keys()), detail_fields)
        self.assertNotIn("customer", response.data)
        self.assertNotIn("user_id", response.data)

        item = response.data["items"][0]
        self.assertEqual(set(item.keys()), self.ITEM_FIELDS)
        self.assertNotIn("storage_path", item)
        self.assertNotIn("download_url", item)

    def test_customer_detail_snapshotted_titles(self) -> None:
        self._authenticate_customer()
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = {item["title"] for item in response.data["items"]}
        slugs = {item["slug"] for item in response.data["items"]}
        self.assertEqual(titles, {"Hero Sword", "UV Toolkit"})
        self.assertEqual(slugs, {"hero-sword", "uv-toolkit"})

        self.product.name = "Renamed Sword"
        self.product.save(update_fields=["name", "updated_at"])
        after_rename = self.client.get(self.detail_url)
        self.assertEqual(after_rename.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {item["title"] for item in after_rename.data["items"]},
            {"Hero Sword", "UV Toolkit"},
        )

    def test_serializer_falls_back_to_live_catalog_when_snapshot_missing(self) -> None:
        self._authenticate_customer()
        item = self.order.items.get(product_type=OrderItem.ProductType.PRODUCT)
        item.title = None
        item.slug = None
        item.save(update_fields=["title", "slug", "updated_at"])

        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product_row = next(
            row
            for row in response.data["items"]
            if row["product_type"] == OrderItem.ProductType.PRODUCT
        )
        self.assertEqual(product_row["title"], "Hero Sword")
        self.assertEqual(product_row["slug"], "hero-sword")


class OrderInvoiceAPITests(OrderTestMixin, APITestCase):
    def setUp(self) -> None:
        super().setUp()
        cache.clear()
        self.password = "StrongPass123!"
        self.admin_role = Role.objects.get(role_name="Administrator")
        self.admin_user = User.objects.create_user(
            email="admin-invoice@example.com",
            full_name="Admin Invoice",
            password=self.password,
            role=self.admin_role,
            email_verified=True,
        )
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff", "updated_at"])
        self.other_customer = User.objects.create_user(
            email="other-invoice-customer@example.com",
            full_name="Other Invoice Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.admin_login_url = reverse("accounts:admin-login")
        self.customer_login_url = reverse("accounts:login")
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
        self.customer_invoice_url = reverse(
            "orders:order-invoice",
            kwargs={"order_id": self.order.id},
        )
        self.admin_invoice_url = reverse(
            "orders_admin:admin-order-invoice",
            kwargs={"order_id": self.order.id},
        )

    def _authenticate_admin(self) -> None:
        response = self.client.post(
            self.admin_login_url,
            {"email": self.admin_user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _authenticate_customer(self, user: User | None = None) -> None:
        account = user or self.user
        response = self.client.post(
            self.customer_login_url,
            {"email": account.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _mark_paid(self) -> None:
        OrderService.update_order_status(self.order, Order.OrderStatus.PAID)
        OrderService.update_payment_status(self.order, Order.PaymentStatus.PAID)
        self.order.refresh_from_db()

    def test_customer_cannot_download_invoice_when_unpaid(self) -> None:
        self._authenticate_customer()
        response = self.client.get(self.customer_invoice_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_customer_can_download_invoice_when_paid(self) -> None:
        self._mark_paid()
        self._authenticate_customer()
        response = self.client.get(self.customer_invoice_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        disposition = response.get("Content-Disposition", "")
        self.assertIn("attachment", disposition)
        self.assertIn(self.order.invoice_number, disposition)
        pdf_bytes = b"".join(response.streaming_content)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))
        self.assertGreater(len(pdf_bytes), 100)

    def test_other_customer_cannot_download_invoice(self) -> None:
        self._mark_paid()
        self._authenticate_customer(self.other_customer)
        response = self.client.get(self.customer_invoice_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_cannot_download_invoice_when_unpaid(self) -> None:
        self._authenticate_admin()
        response = self.client.get(self.admin_invoice_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_download_invoice_when_paid(self) -> None:
        self._mark_paid()
        self._authenticate_admin()
        response = self.client.get(self.admin_invoice_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        pdf_bytes = b"".join(response.streaming_content)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))
