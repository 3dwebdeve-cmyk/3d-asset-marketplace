"""Pricing at approval (free or paid), free downloads without checkout, and admin delete."""

from __future__ import annotations

import tempfile
from decimal import Decimal

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from cart.models import Cart, CartItem
from orders.models import Order, OrderItem
from products.models import Product, ProductImage
from products import test_product_qa
from wishlist.models import WishlistItem

# The QA tests' helpers are borrowed through the module, so their class is not run twice.
_QA = test_product_qa.ProductQAWorkflowAPITests.__dict__


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class FreeAndPaidApprovalTests(APITestCase):
    setUp = _QA["setUp"]
    _authenticate_as_admin = _QA["_authenticate_as_admin"]
    _authenticate_as_customer = _QA["_authenticate_as_customer"]
    _write_package = _QA["_write_package"]
    _import_happy_product = _QA["_import_happy_product"]
    _approve_url = _QA["_approve_url"]

    def _approve(self, product: Product, payload: dict | None = None):
        return self.client.post(self._approve_url(product.pk), payload or {}, format="json")

    def _publish_free(self) -> Product:
        self._authenticate_as_admin()
        product = self._import_happy_product()
        response = self._approve(product, {"pricing": "free"})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.client.credentials()
        return Product.objects.get(pk=product.pk)

    def _claim(self, product: Product):
        return self.client.post(
            reverse("products:product-claim-free", kwargs={"slug": product.slug}), format="json"
        )

    def test_approve_without_pricing_keeps_the_price(self) -> None:
        self._authenticate_as_admin()
        product = self._import_happy_product()
        response = self._approve(product)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["price"], "29.99")
        self.assertFalse(response.data["is_free"])

    def test_approve_as_paid_sets_the_price(self) -> None:
        self._authenticate_as_admin()
        product = self._import_happy_product()
        response = self._approve(product, {"pricing": "paid", "price": "49.00"})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PUBLISHED)
        self.assertEqual(product.price, Decimal("49.00"))

    def test_paid_needs_a_price_above_the_checkout_minimum(self) -> None:
        self._authenticate_as_admin()
        product = self._import_happy_product()
        for payload in ({"pricing": "paid"}, {"pricing": "paid", "price": "0"}, {"pricing": "paid", "price": "0.10"}):
            with self.subTest(payload=payload):
                response = self._approve(product, payload)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.PENDING_REVIEW)

    def test_approve_as_free_publishes_at_price_zero(self) -> None:
        product = self._publish_free()
        self.assertEqual(product.status, Product.Status.PUBLISHED)
        self.assertEqual(product.price, Decimal("0.00"))
        self.assertIsNone(product.discount_price)
        detail = self.client.get(reverse("products:product-detail", kwargs={"slug": product.slug}))
        self.assertTrue(detail.data["is_free"])

    def test_claiming_a_free_model_adds_it_to_downloads_without_checkout(self) -> None:
        product = self._publish_free()
        self._authenticate_as_customer()

        response = self._claim(product)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        order = Order.objects.get(pk=response.data["order_id"])
        self.assertEqual(order.user, self.customer_user)
        self.assertEqual(order.total_amount, Decimal("0.00"))
        self.assertEqual(order.order_status, Order.OrderStatus.PAID)
        self.assertFalse(hasattr(order, "payment") and order.payment)
        entitlements = self.client.get(reverse("downloads:download-entitlements"))
        self.assertEqual(entitlements.status_code, status.HTTP_200_OK)
        self.assertIn(str(product.pk), str(entitlements.data))

    def test_claiming_twice_keeps_one_order(self) -> None:
        product = self._publish_free()
        self._authenticate_as_customer()
        self._claim(product)
        again = self._claim(product)
        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertFalse(again.data["created"])
        self.assertEqual(OrderItem.objects.filter(product_id=product.pk).count(), 1)

    def test_paid_model_cannot_be_claimed(self) -> None:
        self._authenticate_as_admin()
        product = self._import_happy_product()
        self._approve(product)
        self._authenticate_as_customer()
        response = self._claim(product)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(OrderItem.objects.filter(product_id=product.pk).exists())

    def test_claim_requires_sign_in(self) -> None:
        product = self._publish_free()
        self.assertEqual(self._claim(product).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_free_model_cannot_go_in_the_cart(self) -> None:
        product = self._publish_free()
        self._authenticate_as_customer()
        response = self.client.post(
            reverse("cart:cart-detail"),
            {"product_type": "product", "product_id": str(product.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CartItem.objects.filter(product_id=product.pk).exists())


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class AdminBulkDeleteTests(APITestCase):
    setUp_base = _QA["setUp"]
    _authenticate_as_admin = _QA["_authenticate_as_admin"]
    _authenticate_as_customer = _QA["_authenticate_as_customer"]

    def setUp(self) -> None:
        self.setUp_base()
        self.url = reverse("products_admin:admin-product-bulk-delete")

    def _product(self, name: str, **fields) -> Product:
        return Product.objects.create(
            category=self.chairs,
            name=name,
            slug=Product.build_slug(name),
            price=Decimal("10.00"),
            status=fields.pop("status", Product.Status.PUBLISHED),
            **fields,
        )

    def _order_for(self, product: Product) -> None:
        order = Order.objects.create(
            user=self.customer_user,
            invoice_number=f"INV-TEST-{product.slug}",
            total_amount=Decimal("10.00"),
            order_status=Order.OrderStatus.PAID,
            payment_status=Order.PaymentStatus.PAID,
        )
        OrderItem.objects.create(
            order=order,
            product_type="product",
            product_id=product.pk,
            quantity=1,
            purchase_price=Decimal("10.00"),
        )

    def test_unsold_and_sold_products_both_move_to_archived(self) -> None:
        unsold = self._product("Unsold Chair")
        sold = self._product("Sold Chair")
        self._order_for(sold)
        cart, _ = Cart.objects.get_or_create(user=self.customer_user)
        CartItem.objects.create(cart=cart, product_type="product", product_id=unsold.pk, quantity=1)
        WishlistItem.objects.create(user=self.customer_user, product_type="product", product_id=unsold.pk)
        missing = "00000000-0000-0000-0000-000000000000"
        self._authenticate_as_admin()

        response = self.client.post(
            self.url, {"product_ids": [str(unsold.pk), str(sold.pk), missing]}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["deleted"], [])
        self.assertEqual(response.data["archived"], [str(unsold.pk), str(sold.pk)])
        self.assertEqual(response.data["not_found"], [missing])
        unsold.refresh_from_db()
        self.assertEqual(unsold.status, Product.Status.ARCHIVED)
        self.assertFalse(WishlistItem.objects.filter(product_id=unsold.pk).exists())
        self.assertFalse(CartItem.objects.filter(product_id=unsold.pk).exists())
        sold.refresh_from_db()
        self.assertEqual(sold.status, Product.Status.ARCHIVED)
        list_url = reverse("products_admin:admin-products")
        self.assertEqual(self.client.get(list_url).data["count"], 0)
        self.assertEqual(self.client.get(list_url, {"status": "archived"}).data["count"], 2)
        self.assertEqual(self.client.get(list_url, {"search": unsold.name}).data["count"], 0)
        self.assertEqual(self.client.get(list_url, {"status": "archived", "search": unsold.name}).data["count"], 1)
        repeat = self.client.post(self.url, {"product_ids": [str(unsold.pk), str(unsold.pk)]}, format="json")
        self.assertEqual(repeat.data["archived"], [str(unsold.pk)])
        self.assertTrue(Product.objects.filter(pk=unsold.pk).exists())

    def test_delete_retains_console_media_and_uploader_files_in_archive(self) -> None:
        console_key = default_storage.save("products/images/console.webp", ContentFile(b"x"))
        uploader_key = default_storage.save("models/MDL-000777/previewthumb_MDL-000777.jpg", ContentFile(b"x"))
        product = self._product(
            "Media Chair",
            thumbnail=f"http://testserver/media/{uploader_key}",
        )
        ProductImage.objects.create(
            product=product, image_url=f"http://testserver/media/{console_key}", display_order=0
        )
        self._authenticate_as_admin()

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.url, {"product_ids": [str(product.pk)]}, format="json")

        self.assertEqual(response.data["deleted"], [])
        self.assertEqual(response.data["archived"], [str(product.pk)])
        self.assertTrue(ProductImage.objects.filter(product=product).exists())
        self.assertTrue(default_storage.exists(console_key))
        self.assertTrue(default_storage.exists(uploader_key))

    def test_restore_returns_archived_product_to_products_as_draft(self) -> None:
        product = self._product("Accidentally Archived", status=Product.Status.ARCHIVED)
        self._authenticate_as_admin()
        restore_url = reverse("products_admin:admin-product-restore", kwargs={"product_id": product.pk})
        # Restoration cannot be used to publish or change price via request payload.
        response = self.client.post(restore_url, {"status": "published", "price": "0.00"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.DRAFT)
        self.assertEqual(product.price, Decimal("10.00"))
        list_url = reverse("products_admin:admin-products")
        self.assertEqual(self.client.get(list_url).data["results"][0]["id"], str(product.pk))
        self.assertEqual(self.client.get(list_url, {"status": "archived"}).data["count"], 0)
        self.assertEqual(self.client.get(reverse("products:product-list")).data["count"], 0)
        public_url = reverse("products:product-detail", kwargs={"slug": product.slug})
        self.assertEqual(self.client.get(public_url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.post(restore_url, {}, format="json").status_code, status.HTTP_400_BAD_REQUEST)

    def test_restore_rejects_non_archived_and_missing_products(self) -> None:
        self._authenticate_as_admin()
        for product_status in (Product.Status.PUBLISHED, Product.Status.PENDING_REVIEW, Product.Status.DRAFT, Product.Status.REJECTED):
            product = self._product(f"Status {product_status}", status=product_status)
            url = reverse("products_admin:admin-product-restore", kwargs={"product_id": product.pk})
            self.assertEqual(self.client.post(url, {}, format="json").status_code, status.HTTP_400_BAD_REQUEST)
            product.refresh_from_db()
            self.assertEqual(product.status, product_status)
        missing = reverse("products_admin:admin-product-restore", kwargs={"product_id": "00000000-0000-0000-0000-000000000000"})
        self.assertEqual(self.client.post(missing, {}, format="json").status_code, status.HTTP_404_NOT_FOUND)

    def test_restore_requires_administrator(self) -> None:
        product = self._product("Archived Guard", status=Product.Status.ARCHIVED)
        url = reverse("products_admin:admin-product-restore", kwargs={"product_id": product.pk})
        self.assertEqual(self.client.post(url, {}, format="json").status_code, status.HTTP_401_UNAUTHORIZED)
        self._authenticate_as_customer()
        self.assertEqual(self.client.post(url, {}, format="json").status_code, status.HTTP_403_FORBIDDEN)
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.ARCHIVED)

    def test_bulk_delete_requires_administrator(self) -> None:
        product = self._product("Guarded Chair")
        self._authenticate_as_customer()
        response = self.client.post(self.url, {"product_ids": [str(product.pk)]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Product.objects.filter(pk=product.pk).exists())
