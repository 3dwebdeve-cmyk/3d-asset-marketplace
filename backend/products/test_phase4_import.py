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
            sku="IMP-000001",
            price=Decimal("20.00"),
            status=Product.Status.DRAFT,
        )
        ProductImage.objects.create(
            product=self.product,
            image_url="https://cdn.example.com/admin-uploaded.jpg",
            display_order=0,
            is_primary=True,
        )
        # An admin upload with no package kind (docs/PACKAGES_PIPELINE.md, F1).
        ProductFile.objects.create(
            product=self.product,
            file_name="chair.zip",
            file_format="zip",
            file_size=10,
            storage_path="products/files/chair.zip",
            version="1.0",
            is_preview=False,
        )

    def test_reimport_without_gallery_keeps_existing_images(self) -> None:
        # Even a gallery the import may replace is kept when the batch sends none.
        CatalogImportService._sync_gallery(self.product, [], replace=True)

        self.assertEqual(ProductImage.objects.filter(product=self.product).count(), 1)

    def test_reimport_adds_its_packages_and_keeps_files_without_a_kind(self) -> None:
        new_kinds = CatalogImportService._sync_packages(
            self.product,
            [
                {
                    "kind": "whole",
                    "key": "models/IMP-000001/IMP-000001_whole.zip",
                    "file_name": "IMP-000001_whole.zip",
                    "file_size": 20,
                }
            ],
            free_upload=False,
        )

        self.assertEqual(new_kinds, ["whole"])
        files = {row.storage_path: row.package_kind for row in self.product.files.all()}
        self.assertEqual(
            files,
            {"products/files/chair.zip": "", "models/IMP-000001/IMP-000001_whole.zip": "whole"},
        )
