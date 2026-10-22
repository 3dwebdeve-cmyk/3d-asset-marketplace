from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from accounts.throttles import CartWriteRateThrottle
from cart.models import Cart, CartItem
from categories.models import Category
from plugins.models import Plugin, PluginCategory
from products.models import Product


class CartAPITests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.customer_role = Role.objects.get(role_name="Customer")
        self.password = "StrongPass123!"

        self.customer = User.objects.create_user(
            email="customer@example.com",
            full_name="Test Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        self.other_customer = User.objects.create_user(
            email="other@example.com",
            full_name="Other Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )

        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.published_product = Product.objects.create(
            category=self.category,
            name="Oak Chair",
            slug="oak-chair",
            short_description="A wooden chair",
            price=Decimal("29.99"),
            status=Product.Status.PUBLISHED,
        )
        self.discounted_product = Product.objects.create(
            category=self.category,
            name="Sale Desk",
            slug="sale-desk",
            price=Decimal("100.00"),
            discount_price=Decimal("79.99"),
            status=Product.Status.PUBLISHED,
        )
        self.draft_product = Product.objects.create(
            category=self.category,
            name="Hidden Desk",
            slug="hidden-desk",
            price=Decimal("99.00"),
            status=Product.Status.DRAFT,
        )
        self.archived_product = Product.objects.create(
            category=self.category,
            name="Old Lamp",
            slug="old-lamp",
            price=Decimal("15.00"),
            status=Product.Status.ARCHIVED,
        )
        self.eur_product = Product.objects.create(
            category=self.category,
            name="Euro Chair",
            slug="euro-chair",
            price=Decimal("50.00"),
            currency="EUR",
            status=Product.Status.PUBLISHED,
        )

        self.plugin_category = PluginCategory.objects.create(
            name="Tools",
            slug="tools",
            is_active=True,
        )
        self.published_plugin = Plugin.objects.create(
            category=self.plugin_category,
            name="UV Toolkit",
            slug="uv-toolkit",
            short_description="UV tools",
            price=Decimal("19.99"),
            status=Plugin.Status.PUBLISHED,
        )
        self.draft_plugin = Plugin.objects.create(
            category=self.plugin_category,
            name="Hidden Plugin",
            slug="hidden-plugin",
            price=Decimal("9.99"),
            status=Plugin.Status.DRAFT,
        )

        self.cart_url = reverse("cart:cart-detail")
        self.login_url = reverse("accounts:login")

    def authenticate(self, user: User | None = None) -> None:
        target = user or self.customer
        login = self.client.post(
            self.login_url,
            {"email": target.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def test_unauthenticated_requests_return_401(self) -> None:
        response = self.client.get(self.cart_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        add = self.client.post(
            self.cart_url,
            {
                "product_type": "product",
                "product_id": str(self.published_product.pk),
            },
            format="json",
        )
        self.assertEqual(add.status_code, status.HTTP_401_UNAUTHORIZED)

        delete = self.client.delete(
            reverse("cart:cart-item-detail", kwargs={"item_id": uuid4()}),
        )
        self.assertEqual(delete.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_empty_cart_returns_zero_totals(self) -> None:
        self.authenticate()
        response = self.client.get(self.cart_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["item_count"], 0)
        self.assertEqual(response.data["total_quantity"], 0)
        self.assertEqual(response.data["subtotal"], "0.00")
        self.assertEqual(response.data["discount_amount"], "0.00")
        self.assertEqual(response.data["total"], "0.00")
        self.assertEqual(response.data["currency"], "USD")
        self.assertEqual(response.data["items"], [])

    def test_add_published_product_returns_201(self) -> None:
        self.authenticate()
        response = self.client.post(
            self.cart_url,
            {
                "product_type": "product",
                "product_id": str(self.published_product.pk),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["product_type"], "product")
        self.assertEqual(response.data["quantity"], 1)
        self.assertEqual(response.data["catalog"]["name"], "Oak Chair")
        self.assertEqual(response.data["unit_price"], "29.99")

    def test_add_published_plugin_returns_201(self) -> None:
        self.authenticate()
        response = self.client.post(
            self.cart_url,
            {
                "product_type": "plugin",
                "product_id": str(self.published_plugin.pk),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["product_type"], "plugin")
        self.assertEqual(response.data["catalog"]["slug"], "uv-toolkit")

    def test_add_merges_quantity_for_existing_line(self) -> None:
        self.authenticate()
        payload = {
            "product_type": "product",
            "product_id": str(self.published_product.pk),
            "quantity": 2,
        }
        first = self.client.post(self.cart_url, payload, format="json")
        second = self.client.post(self.cart_url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(second.data["quantity"], 4)

    def test_add_rejects_draft_archived_and_missing_items(self) -> None:
        self.authenticate()
        cases = [
            ("product", self.draft_product.pk),
            ("product", self.archived_product.pk),
            ("plugin", self.draft_plugin.pk),
            ("product", uuid4()),
        ]
        for product_type, product_id in cases:
            response = self.client.post(
                self.cart_url,
                {"product_type": product_type, "product_id": str(product_id)},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("product_id", response.data)

    def test_add_rejects_plugin_with_inactive_category(self) -> None:
        inactive_category = PluginCategory.objects.create(
            name="Inactive",
            slug="inactive",
            is_active=False,
        )
        plugin = Plugin.objects.create(
            category=inactive_category,
            name="Inactive Plugin",
            slug="inactive-plugin",
            price=Decimal("5.00"),
            status=Plugin.Status.PUBLISHED,
        )
        self.authenticate()
        response = self.client.post(
            self.cart_url,
            {"product_type": "plugin", "product_id": str(plugin.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("product_id", response.data)

    def test_add_rejects_mixed_currency(self) -> None:
        self.authenticate()
        first = self.client.post(
            self.cart_url,
            {
                "product_type": "product",
                "product_id": str(self.published_product.pk),
            },
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(
            self.cart_url,
            {
                "product_type": "product",
                "product_id": str(self.eur_product.pk),
            },
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("product_id", second.data)

    def test_get_cart_recalculates_totals_with_discount_and_quantity(self) -> None:
        self.authenticate()
        self.client.post(
            self.cart_url,
            {
                "product_type": "product",
                "product_id": str(self.discounted_product.pk),
                "quantity": 2,
            },
            format="json",
        )
        self.client.post(
            self.cart_url,
            {
                "product_type": "plugin",
                "product_id": str(self.published_plugin.pk),
            },
            format="json",
        )

        response = self.client.get(self.cart_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["item_count"], 2)
        self.assertEqual(response.data["total_quantity"], 3)
        self.assertEqual(response.data["subtotal"], "179.97")
        self.assertEqual(response.data["discount_amount"], "0.00")
        self.assertEqual(response.data["total"], "179.97")

    def test_patch_quantity_updates_item(self) -> None:
        cart = Cart.objects.create(user=self.customer)
        item = CartItem.objects.create(
            cart=cart,
            product_type=CartItem.ProductType.PRODUCT,
            product_id=self.published_product.pk,
            quantity=1,
        )
        self.authenticate()
        url = reverse("cart:cart-item-detail", kwargs={"item_id": item.pk})
        response = self.client.patch(url, {"quantity": 3}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["quantity"], 3)
        self.assertEqual(response.data["line_total"], "89.97")

    def test_remove_own_item_returns_204(self) -> None:
        cart = Cart.objects.create(user=self.customer)
        item = CartItem.objects.create(
            cart=cart,
            product_type=CartItem.ProductType.PRODUCT,
            product_id=self.published_product.pk,
            quantity=1,
        )
        self.authenticate()
        url = reverse("cart:cart-item-detail", kwargs={"item_id": item.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(CartItem.objects.filter(pk=item.pk).exists())

    def test_remove_other_users_item_returns_404(self) -> None:
        other_cart = Cart.objects.create(user=self.other_customer)
        item = CartItem.objects.create(
            cart=other_cart,
            product_type=CartItem.ProductType.PRODUCT,
            product_id=self.published_product.pk,
            quantity=1,
        )
        self.authenticate(self.customer)
        url = reverse("cart:cart-item-detail", kwargs={"item_id": item.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(CartItem.objects.filter(pk=item.pk).exists())

    def test_clear_cart_returns_204(self) -> None:
        cart = Cart.objects.create(user=self.customer)
        CartItem.objects.create(
            cart=cart,
            product_type=CartItem.ProductType.PRODUCT,
            product_id=self.published_product.pk,
            quantity=1,
        )
        self.authenticate()
        response = self.client.delete(self.cart_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(cart.items.count(), 0)

    def test_unavailable_item_excluded_from_subtotal_but_listed(self) -> None:
        cart = Cart.objects.create(user=self.customer)
        CartItem.objects.create(
            cart=cart,
            product_type=CartItem.ProductType.PRODUCT,
            product_id=self.archived_product.pk,
            quantity=2,
        )
        CartItem.objects.create(
            cart=cart,
            product_type=CartItem.ProductType.PRODUCT,
            product_id=self.published_product.pk,
            quantity=1,
        )
        self.authenticate()
        response = self.client.get(self.cart_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["item_count"], 2)
        self.assertEqual(response.data["subtotal"], "29.99")
        archived_row = next(
            row
            for row in response.data["items"]
            if row["product_id"] == str(self.archived_product.pk)
        )
        self.assertFalse(archived_row["catalog"]["is_available"])
        self.assertIsNone(archived_row["line_total"])

    @patch.object(CartWriteRateThrottle, "rate", "1/min", create=True)
    def test_write_endpoints_are_rate_limited(self) -> None:
        self.authenticate()
        payload = {
            "product_type": "product",
            "product_id": str(self.published_product.pk),
        }
        first = self.client.post(self.cart_url, payload, format="json")
        second = self.client.post(self.cart_url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(second.data.get("code"), "throttled")


class OwnedItemTests(APITestCase):
    """A digital item is bought once: neither the cart nor checkout lets the owner pay again."""

    setUp = CartAPITests.setUp
    authenticate = CartAPITests.authenticate

    def give_customer(self, product: Product) -> None:
        from orders.models import Order, OrderItem

        order = Order.objects.create(
            user=self.customer,
            invoice_number=f"INV-OWNED-{product.pk.hex[:8]}",
            total_amount=product.price,
            order_status=Order.OrderStatus.PAID,
            payment_status=Order.PaymentStatus.PAID,
        )
        OrderItem.objects.create(
            order=order,
            product_type=OrderItem.ProductType.PRODUCT,
            product_id=product.pk,
            quantity=1,
            purchase_price=product.price,
        )

    def test_owned_item_cannot_be_added_to_the_cart(self) -> None:
        self.give_customer(self.published_product)
        self.authenticate()

        response = self.client.post(
            self.cart_url,
            {"product_type": "product", "product_id": str(self.published_product.pk)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already own", str(response.data))
        self.assertFalse(CartItem.objects.filter(product_id=self.published_product.pk).exists())

    def test_checkout_refuses_an_item_bought_after_it_was_added(self) -> None:
        from orders.services import OrderError, OrderService

        self.authenticate()
        self.client.post(
            self.cart_url,
            {"product_type": "product", "product_id": str(self.published_product.pk)},
            format="json",
        )
        self.give_customer(self.published_product)

        with self.assertRaises(OrderError) as ctx:
            OrderService.create_from_cart(self.customer)
        self.assertIn("You already own Oak Chair", ctx.exception.message)

    def test_a_refunded_item_can_be_bought_again(self) -> None:
        from orders.models import Order

        self.give_customer(self.published_product)
        Order.objects.filter(user=self.customer).update(
            order_status=Order.OrderStatus.REFUNDED, payment_status=Order.PaymentStatus.REFUNDED
        )
        self.authenticate()

        response = self.client.post(
            self.cart_url,
            {"product_type": "product", "product_id": str(self.published_product.pk)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
