"""Phase I1 — seed_demo_catalog staging smoke tests."""

from __future__ import annotations

from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings

from categories.models import Category
from config.package_audit import PublishedPackageAuditService
from plugins.models import Plugin, PluginCategory, PluginImage
from products.models import Product, ProductImage


@override_settings(FRONTEND_BASE_URL="http://localhost:5173")
class SeedDemoCatalogCommandTests(TestCase):
    def test_seeds_published_catalog_with_packages_and_images(self) -> None:
        out = StringIO()
        call_command("seed_demo_catalog", stdout=out)

        self.assertIn("Demo catalog ready", out.getvalue())
        self.assertEqual(
            Product.objects.filter(status=Product.Status.PUBLISHED).count(),
            3,
        )
        self.assertEqual(
            Plugin.objects.filter(status=Plugin.Status.PUBLISHED).count(),
            2,
        )
        self.assertEqual(PublishedPackageAuditService.audit(), [])

        chair = Product.objects.get(slug="demo-oak-chair")
        self.assertEqual(chair.sku, "DEMO-CHAIR-001")
        self.assertEqual(chair.price, Decimal("29.99"))
        self.assertTrue(chair.has_package)
        self.assertTrue(chair.has_preview)
        self.assertTrue(chair.has_thumbnail)
        self.assertTrue(chair.thumbnail.endswith("/images/about/offer-3d-models.jpg"))
        self.assertTrue(
            chair.preview_model.endswith("/fixtures/e2e-preview.glb")
        )
        self.assertTrue(
            ProductImage.objects.filter(product=chair, is_primary=True).exists()
        )

        plugin = Plugin.objects.get(slug="demo-uv-toolkit")
        self.assertEqual(plugin.price, Decimal("19.99"))
        self.assertTrue(plugin.thumbnail.endswith("/images/about/offer-plugins.jpg"))
        self.assertTrue(
            PluginImage.objects.filter(plugin=plugin, is_primary=True).exists()
        )

    def test_unpublishes_incomplete_published_skus(self) -> None:
        category = Category.objects.create(name="Legacy", slug="legacy-assets")
        Product.objects.create(
            category=category,
            name="Broken Tree",
            slug="tree",
            price=Decimal("211.98"),
            status=Product.Status.PUBLISHED,
            has_package=False,
        )
        PluginCategory.objects.create(name="Legacy Tools", slug="legacy-tools")

        call_command("seed_demo_catalog", stdout=StringIO())

        broken = Product.objects.get(slug="tree")
        self.assertEqual(broken.status, Product.Status.DRAFT)
        self.assertEqual(PublishedPackageAuditService.audit(), [])

    def test_keep_incomplete_leaves_broken_published(self) -> None:
        category = Category.objects.create(name="Legacy Keep", slug="legacy-keep")
        Product.objects.create(
            category=category,
            name="Oak Chair",
            slug="oak-chair",
            price=Decimal("29.99"),
            status=Product.Status.PUBLISHED,
            has_package=False,
        )

        call_command(
            "seed_demo_catalog",
            "--keep-incomplete",
            stdout=StringIO(),
        )

        issues = PublishedPackageAuditService.audit()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].label, "oak-chair")
        self.assertEqual(
            Product.objects.get(slug="oak-chair").status,
            Product.Status.PUBLISHED,
        )
