"""Phase 4: a catalog re-import must not discard media that is already on the product."""

from decimal import Decimal

from django.test import TestCase

from categories.models import Category
from products.catalog_import import CatalogImportService
from products.models import Product, ProductFile, ProductImage


class ReimportKeepsMediaTests(TestCase):
    def setUp(self) -> None:
        category = Category.objects.create(name="Imports", slug="imports")
        self.product = Product.objects.create(
            category=category,
            name="Imported Chair",
            slug="imported-chair",
            price=Decimal("20.00"),
            status=Product.Status.DRAFT,
        )
        ProductImage.objects.create(
            product=self.product,
            image_url="https://cdn.example.com/admin-uploaded.jpg",
            display_order=0,
            is_primary=True,
        )
        ProductFile.objects.create(
            product=self.product,
            file_name="chair.zip",
            file_format="zip",
            file_size=10,
            storage_path="products/files/chair.zip",
            version="1.0",
            is_preview=False,
        )

    def test_reimport_without_gallery_or_package_keeps_existing_media(self) -> None:
        CatalogImportService._sync_gallery(self.product, [])
        CatalogImportService._sync_package(self.product, {"package_key": ""})

        self.assertEqual(ProductImage.objects.filter(product=self.product).count(), 1)
        self.assertEqual(
            ProductFile.objects.filter(product=self.product, is_preview=False).count(),
            1,
        )

    def test_reimport_with_a_new_package_replaces_the_old_row(self) -> None:
        CatalogImportService._sync_package(
            self.product,
            {
                "package_key": "products/files/chair-v2.zip",
                "package_file_name": "chair-v2.zip",
                "package_file_format": "zip",
                "package_file_size": 20,
            },
        )

        files = list(ProductFile.objects.filter(product=self.product, is_preview=False))
        self.assertEqual([row.storage_path for row in files], ["products/files/chair-v2.zip"])
