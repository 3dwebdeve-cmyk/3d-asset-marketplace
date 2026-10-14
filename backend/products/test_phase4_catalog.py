"""Phase 4: products in an inactive category are hidden, and explicit slugs are kept."""

from decimal import Decimal  # noqa: F401

from rest_framework.test import APITestCase

from cart.services import CartService
from payments.test_payments import PaymentsTestMixin
from products.models import Product
from products.services import ProductError, ProductService, ProductUpdateData


class CatalogVisibilityTests(PaymentsTestMixin, APITestCase):
    def test_product_in_inactive_category_is_hidden_and_unbuyable(self) -> None:
        self.category.is_active = False
        self.category.save(update_fields=["is_active"])

        with self.assertRaises(ProductError):
            ProductService.get_public_by_slug(self.product.slug)
        self.assertFalse(
            ProductService.list_public().filter(pk=self.product.pk).exists()
        )

        self._add_to_cart("product", self.product.pk)
        envelope = CartService.get_cart_envelope(self.user)
        snapshot = envelope.snapshots[("product", self.product.pk)]
        self.assertFalse(snapshot["is_available"])

    def test_explicit_slug_is_honoured_when_a_name_is_sent_too(self) -> None:
        # A draft avoids the publish checks, which are not what this test is about.
        self.product.status = Product.Status.DRAFT
        self.product.save(update_fields=["status"])
        updated = ProductService.update_product(
            self.product,
            ProductUpdateData(name="Renamed Sword", slug="custom-sword-slug"),
        )
        self.assertEqual(updated.slug, "custom-sword-slug")
