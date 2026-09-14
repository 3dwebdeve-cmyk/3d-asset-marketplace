from decimal import Decimal
from uuid import uuid4

from django.test import SimpleTestCase, TestCase

from categories.models import Category
from plugins.models import Plugin, PluginCategory
from products.models import Product
from search.documents import plugin_document, product_document
from search.services import (
    build_plugin_filters,
    build_product_filters,
    map_plugin_sort,
    map_product_sort,
    normalize_query,
)


class NormalizeQueryTests(SimpleTestCase):
    def test_strips_and_truncates(self) -> None:
        self.assertIsNone(normalize_query(None))
        self.assertIsNone(normalize_query("   "))
        self.assertEqual(normalize_query("  oak  "), "oak")
        self.assertEqual(len(normalize_query("x" * 150) or ""), 100)


class FilterAndSortMappingTests(SimpleTestCase):
    def test_product_filters(self) -> None:
        category_id = uuid4()
        self.assertEqual(
            build_product_filters(category_id=category_id, animated=True, rigged=False),
            f'category_id = "{category_id}" AND animated = true AND rigged = false',
        )
        self.assertIsNone(build_product_filters())

    def test_plugin_filters(self) -> None:
        category_id = uuid4()
        self.assertEqual(
            build_plugin_filters(category_id=category_id),
            f'category_id = "{category_id}"',
        )
        self.assertIsNone(build_plugin_filters())

    def test_sort_defaults_to_created_at_desc(self) -> None:
        self.assertEqual(map_product_sort(None), ["created_at:desc"])
        self.assertEqual(map_product_sort("nope"), ["created_at:desc"])
        self.assertEqual(map_product_sort("price"), ["price:asc"])
        self.assertEqual(map_plugin_sort("-name"), ["name:desc"])


class DocumentBuilderTests(TestCase):
    def test_product_document_uses_public_fields(self) -> None:
        category = Category.objects.create(name="Furniture", slug="furniture")
        product = Product.objects.create(
            category=category,
            name="Oak Chair",
            slug="oak-chair",
            description="A solid oak chair",
            short_description="Wooden chair",
            software_used="Blender",
            price=Decimal("29.99"),
            animated=True,
            status=Product.Status.PUBLISHED,
        )
        document = product_document(product)
        self.assertEqual(document["id"], str(product.pk))
        self.assertEqual(document["name"], "Oak Chair")
        self.assertEqual(document["software_used"], "Blender")
        self.assertEqual(document["category_id"], str(category.pk))
        self.assertEqual(document["price"], 29.99)
        self.assertTrue(document["animated"])
        self.assertNotIn("sku", document)
        self.assertNotIn("reject_reason", document)
        self.assertIsInstance(document["created_at"], int)

    def test_plugin_document_uses_compatibility(self) -> None:
        category = PluginCategory.objects.create(name="Blender", slug="blender")
        plugin = Plugin.objects.create(
            category=category,
            name="Mesh Toolkit",
            slug="mesh-toolkit",
            compatibility="Blender 4.x",
            price=Decimal("19.00"),
            status=Plugin.Status.PUBLISHED,
        )
        document = plugin_document(plugin)
        self.assertEqual(document["id"], str(plugin.pk))
        self.assertEqual(document["compatibility"], "Blender 4.x")
        self.assertEqual(document["category_id"], str(category.pk))
        self.assertNotIn("software_used", document)
