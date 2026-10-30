"""Pricing at approval (free or paid), free downloads without an account, and admin delete."""

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
from products.test_catalog_import import _happy_item
from products.testing import put_pipeline_uploads
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

    def _publish_free_folder_model(self) -> Product:
        """Import from free-models/<sku>/ (zip in the public bucket) and approve as is."""
        item = _happy_item(r2_key_prefix="free-models/MDL-000142/")
        item["media"] = {
            key: [k.replace("models/", "free-models/", 1) for k in value]
            if isinstance(value, list)
            else value.replace("models/", "free-models/", 1) if isinstance(value, str) else value
            for key, value in item["media"].items()
        }
        put_pipeline_uploads([item])
        self._write_package(item["media"]["package_key"])
        self._authenticate_as_admin()
        response = self.client.post(
            self.import_url,
            {"import_batch_id": "2026-10-30-free", "import_source": "catalog-bridge", "items": [item]},
            format="json",
        )
        self.assertEqual(response.data["created"], 1, response.data)
        product = Product.objects.get(sku="MDL-000142")
        self.assertTrue(product.is_free)
        self.assertEqual(self._approve(product).status_code, status.HTTP_200_OK)
        self.client.credentials()
        return product

    def _free_download(self, product: Product):
        return self.client.get(reverse("products:product-free-download", kwargs={"slug": product.slug}))

    def test_free_folder_model_imports_free_and_anyone_downloads_it(self) -> None:
        product = self._publish_free_folder_model()

        response = self._free_download(product)

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertTrue(response["Location"].endswith("free-models/MDL-000142/package.zip"))

    def test_free_folder_model_cannot_be_published_paid(self) -> None:
        product = self._publish_free_folder_model()
        Product.objects.filter(pk=product.pk).update(status=Product.Status.PENDING_REVIEW)
        self._authenticate_as_admin()
        response = self._approve(product, {"pricing": "paid", "price": "10.00"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_free_model_with_a_private_zip_downloads_without_sign_in(self) -> None:
        product = self._publish_free()
        response = self._free_download(product)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("attachment", response["Content-Disposition"])

    def test_paid_model_has_no_free_download(self) -> None:
        self._authenticate_as_admin()
        product = self._import_happy_product()
        self._approve(product)
        self.client.credentials()
        self.assertEqual(self._free_download(product).status_code, status.HTTP_404_NOT_FOUND)

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

    def test_unsold_products_are_deleted_and_sold_ones_archived(self) -> None:
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
        self.assertEqual(response.data["deleted"], [str(unsold.pk)])
        self.assertEqual(response.data["archived"], [str(sold.pk)])
        self.assertEqual(response.data["not_found"], [missing])
        self.assertFalse(Product.objects.filter(pk=unsold.pk).exists())
        self.assertFalse(WishlistItem.objects.filter(product_id=unsold.pk).exists())
        self.assertFalse(CartItem.objects.filter(product_id=unsold.pk).exists())
        sold.refresh_from_db()
        self.assertEqual(sold.status, Product.Status.ARCHIVED)

    def test_delete_removes_console_media_but_keeps_uploader_files(self) -> None:
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

        self.assertEqual(response.data["deleted"], [str(product.pk)])
        self.assertFalse(default_storage.exists(console_key))
        self.assertTrue(default_storage.exists(uploader_key))

    def test_bulk_delete_requires_administrator(self) -> None:
        product = self._product("Guarded Chair")
        self._authenticate_as_customer()
        response = self.client.post(self.url, {"product_ids": [str(product.pk)]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Product.objects.filter(pk=product.pk).exists())
