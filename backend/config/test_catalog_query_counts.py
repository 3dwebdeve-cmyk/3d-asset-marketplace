"""Public catalog endpoints must not run more database queries as the catalog grows."""

from __future__ import annotations

from decimal import Decimal

from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APITestCase

from categories.models import Category
from plugins.models import Plugin, PluginCategory, PluginFile, PluginImage
from products.models import Product, ProductFile, ProductImage


class CatalogQueryCountTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.plugin_category = PluginCategory.objects.create(name="Tools", slug="tools")
        self.created = 0

    def add_items(self, count: int) -> None:
        for _ in range(count):
            index = self.created
            self.created += 1
            Category.objects.create(name=f"Category {index}", slug=f"category-{index}")
            PluginCategory.objects.create(name=f"Plugin category {index}", slug=f"plugin-category-{index}")
            product = Product.objects.create(
                category=self.category,
                name=f"Chair {index}",
                slug=f"chair-{index}",
                price=Decimal("10.00"),
                status=Product.Status.PUBLISHED,
            )
            for order in range(2):
                ProductImage.objects.create(
                    product=product,
                    image_url=f"https://cdn.example.com/chair-{index}-{order}.png",
                    display_order=order,
                    is_primary=order == 0,
                )
            for file_format in ("glb", "fbx"):
                ProductFile.objects.create(
                    product=product,
                    file_name=f"chair-{index}.{file_format}",
                    file_format=file_format,
                    file_size=1024,
                    storage_path=f"products/files/chair-{index}.{file_format}",
                )
            plugin = Plugin.objects.create(
                category=self.plugin_category,
                name=f"Toolkit {index}",
                slug=f"toolkit-{index}",
                price=Decimal("10.00"),
                status=Plugin.Status.PUBLISHED,
            )
            PluginImage.objects.create(
                plugin=plugin,
                image_url=f"https://cdn.example.com/toolkit-{index}.png",
                is_primary=True,
            )
            PluginFile.objects.create(
                plugin=plugin,
                file_name=f"toolkit-{index}.zip",
                file_format="zip",
                file_size=1024,
                storage_path=f"plugins/files/toolkit-{index}.zip",
            )

    def count_queries(self, url: str, params: dict | None = None) -> int:
        cache.clear()
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(url, params or {})
        self.assertEqual(response.status_code, 200, url)
        return len(queries)

    def endpoints(self) -> dict[str, tuple[str, dict]]:
        return {
            "products": (reverse("products:product-list"), {}),
            "products in category": (
                reverse("products:product-list"),
                {"category_id": str(self.category.pk)},
            ),
            "product detail": (
                reverse("products:product-detail", kwargs={"slug": "chair-0"}),
                {},
            ),
            "categories": (reverse("categories:category-list"), {"page_size": 100}),
            "category detail": (
                reverse("categories:category-detail", kwargs={"slug": "furniture"}),
                {},
            ),
            "plugins": (reverse("plugins:plugin-list"), {}),
            "plugin detail": (
                reverse("plugins:plugin-detail", kwargs={"slug": "toolkit-0"}),
                {},
            ),
            "plugin categories": (reverse("plugin_categories:plugin-category-list"), {}),
        }

    def test_query_count_does_not_grow_with_the_catalog(self) -> None:
        self.add_items(2)
        small = {name: self.count_queries(*args) for name, args in self.endpoints().items()}
        self.add_items(6)
        large = {name: self.count_queries(*args) for name, args in self.endpoints().items()}

        self.assertEqual(small, large)
        # About 6 of these are the rate-limit counter in the database cache; the rest are the
        # catalog itself. A jump here means a new per-request lookup crept in.
        for name, count in large.items():
            self.assertLessEqual(count, 9, name)
