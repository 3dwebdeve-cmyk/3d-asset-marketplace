"""Indexer stubs after Meilisearch removal."""

from decimal import Decimal
from uuid import uuid4

from django.test import TestCase

from categories.models import Category
from products.models import Product
from search.indexer import (
    ensure_indexes,
    reindex_all,
    sync_product,
    sync_product_by_id,
)


class IndexerNoopTests(TestCase):
    def setUp(self) -> None:
        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.product = Product.objects.create(
            category=self.category,
            name="Oak Chair",
            slug="oak-chair",
            price=Decimal("29.99"),
            status=Product.Status.PUBLISHED,
        )

    def test_sync_and_reindex_are_noops(self) -> None:
        ensure_indexes()
        sync_product(self.product)
        sync_product_by_id(self.product.pk)
        sync_product_by_id(uuid4())
        self.assertEqual(reindex_all(), (0, 0))
