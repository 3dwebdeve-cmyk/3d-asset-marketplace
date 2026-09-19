"""Polymorphic catalog orphan report."""

from __future__ import annotations

import uuid
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from accounts.models import Role, User
from cart.models import Cart, CartItem
from categories.models import Category
from config.catalog_integrity import collect_catalog_integrity_report
from products.models import Product


class CatalogIntegrityTests(TestCase):
    def setUp(self) -> None:
        role = Role.objects.get(role_name="Customer")
        self.user = User.objects.create_user(
            email="integrity@example.com",
            full_name="Integrity User",
            password="StrongPass123!",
            role=role,
            email_verified=True,
        )
        self.category = Category.objects.create(name="Integrity", slug="integrity")
        self.product = Product.objects.create(
            category=self.category,
            name="Real Chair",
            slug="real-chair",
            price=Decimal("10.00"),
            status=Product.Status.PUBLISHED,
        )
        self.cart = Cart.objects.create(user=self.user)

    def test_clean_catalog_ok(self) -> None:
        CartItem.objects.create(
            cart=self.cart,
            product_type=CartItem.ProductType.PRODUCT,
            product_id=self.product.id,
            quantity=1,
        )
        report = collect_catalog_integrity_report()
        self.assertTrue(report.ok)
        cart_bucket = next(b for b in report.buckets if b.name == "cart_items")
        self.assertEqual(cart_bucket.total, 0)

    def test_orphan_cart_item_is_blocking(self) -> None:
        CartItem.objects.create(
            cart=self.cart,
            product_type=CartItem.ProductType.PRODUCT,
            product_id=uuid.uuid4(),
            quantity=1,
        )
        report = collect_catalog_integrity_report()
        self.assertFalse(report.ok)
        self.assertGreaterEqual(report.blocking_orphans, 1)
        out = StringIO()
        with self.assertRaises(CommandError):
            call_command("check_catalog_integrity", fail_on_orphans=True, stdout=out)
