"""Permanent delete of an archived model (POST /api/v1/admin/products/<id>/purge/)."""

from __future__ import annotations

import tempfile
from decimal import Decimal

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import ActivityLog
from cart.models import Cart, CartItem
from orders.models import Order, OrderItem
from products import test_product_qa
from products.models import Product, ProductImage
from wishlist.models import WishlistItem

_QA = test_product_qa.ProductQAWorkflowAPITests.__dict__


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class AdminProductPurgeTests(APITestCase):
    setUp = _QA["setUp"]
    _authenticate_as_admin = _QA["_authenticate_as_admin"]
    _authenticate_as_customer = _QA["_authenticate_as_customer"]

    def _product(self, name: str, *, sku: str | None = None, **fields) -> Product:
        return Product.objects.create(
            category=self.chairs,
            name=name,
            slug=Product.build_slug(name),
            sku=sku,
            price=Decimal("10.00"),
            status=fields.pop("status", Product.Status.ARCHIVED),
            **fields,
        )

    def _url(self, product_id) -> str:
        return reverse("products_admin:admin-product-purge", kwargs={"product_id": product_id})

    def _order_for(self, product: Product) -> None:
        order = Order.objects.create(
            user=self.customer_user,
            invoice_number=f"INV-PURGE-{product.slug}",
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

    def test_archived_unsold_model_is_deleted_with_all_its_files(self) -> None:
        product = self._product("Old Chair", sku="PRG-000001")
        own_keys = [
            default_storage.save(f"products/images/{product.pk}/a.webp", ContentFile(b"x")),
            default_storage.save(f"products/files/{product.pk}/pack.zip", ContentFile(b"x")),
            default_storage.save("models/PRG-000001/PRG-000001_max.zip", ContentFile(b"x")),
            default_storage.save("models/PRG-000001/thumb/previewthumb.jpg", ContentFile(b"x")),
            default_storage.save("free-models/PRG-000001/PRG-000001_fbx.zip", ContentFile(b"x")),
            default_storage.save("360/PRG-000001/360_PRG-000001_01.jpg", ContentFile(b"x")),
        ]
        # A neighbour whose SKU starts the same way must be left alone.
        other_key = default_storage.save("models/PRG-0000010/keep.zip", ContentFile(b"x"))
        ProductImage.objects.create(product=product, image_url=f"/media/{own_keys[0]}")
        cart, _ = Cart.objects.get_or_create(user=self.customer_user)
        CartItem.objects.create(cart=cart, product_type="product", product_id=product.pk, quantity=1)
        WishlistItem.objects.create(user=self.customer_user, product_type="product", product_id=product.pk)
        self._authenticate_as_admin()

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self._url(product.pk), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["deleted"], str(product.pk))
        self.assertFalse(Product.objects.filter(pk=product.pk).exists())
        self.assertFalse(ProductImage.objects.filter(product_id=product.pk).exists())
        self.assertFalse(CartItem.objects.filter(product_id=product.pk).exists())
        self.assertFalse(WishlistItem.objects.filter(product_id=product.pk).exists())
        for key in own_keys:
            self.assertFalse(default_storage.exists(key), key)
        self.assertTrue(default_storage.exists(other_key))
        self.assertTrue(
            ActivityLog.objects.filter(action="product_purge", target_id=str(product.pk)).exists()
        )

    def test_bought_model_is_refused_and_stays_archived(self) -> None:
        product = self._product("Sold Chair", sku="PRG-000002")
        key = default_storage.save("models/PRG-000002/PRG-000002_max.zip", ContentFile(b"x"))
        self._order_for(product)
        self._authenticate_as_admin()

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self._url(product.pk), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.data)
        self.assertIn("customer's order", str(response.data))
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.ARCHIVED)
        self.assertTrue(default_storage.exists(key))

    def test_model_that_is_not_archived_is_refused(self) -> None:
        product = self._product("Live Chair", status=Product.Status.PUBLISHED)
        self._authenticate_as_admin()

        response = self.client.post(self._url(product.pk), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.data)
        self.assertTrue(Product.objects.filter(pk=product.pk).exists())

    def test_unknown_model_is_not_found(self) -> None:
        self._authenticate_as_admin()
        response = self.client.post(
            self._url("00000000-0000-0000-0000-000000000000"), {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_cannot_purge(self) -> None:
        product = self._product("Guarded Chair")
        self._authenticate_as_customer()
        response = self.client.post(self._url(product.pk), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Product.objects.filter(pk=product.pk).exists())
