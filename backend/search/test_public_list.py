from decimal import Decimal

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from categories.models import Category
from plugins.models import Plugin, PluginCategory
from products.models import Product
from search.services import hydrate_products, search_published_products


class PostgresPublicSearchApiTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.chair = Product.objects.create(
            category=self.category,
            name="Oak Chair",
            slug="oak-chair",
            short_description="A wooden chair",
            price=Decimal("29.99"),
            status=Product.Status.PUBLISHED,
        )
        self.table = Product.objects.create(
            category=self.category,
            name="Pine Table",
            slug="pine-table",
            short_description="A pine table",
            price=Decimal("49.00"),
            status=Product.Status.PUBLISHED,
        )
        self.draft = Product.objects.create(
            category=self.category,
            name="Hidden Desk",
            slug="hidden-desk",
            short_description="A wooden desk",
            price=Decimal("99.00"),
            status=Product.Status.DRAFT,
        )
        self.list_url = reverse("products:product-list")

    def test_search_uses_postgres_icontains(self) -> None:
        response = self.client.get(self.list_url, {"search": "pine"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "pine-table")

    def test_search_excludes_drafts(self) -> None:
        response = self.client.get(self.list_url, {"search": "wooden"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "oak-chair")

    def test_empty_search_lists_published(self) -> None:
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_meili_helpers_are_noops(self) -> None:
        self.assertIsNone(
            search_published_products(query="chair", page=1, page_size=10)
        )
        ordered = hydrate_products([self.table.pk, self.chair.pk])
        self.assertEqual([item.slug for item in ordered], ["pine-table", "oak-chair"])


class PostgresPluginSearchApiTests(APITestCase):
    def setUp(self) -> None:
        cache.clear()
        self.category = PluginCategory.objects.create(name="Blender", slug="blender")
        self.plugin = Plugin.objects.create(
            category=self.category,
            name="Mesh Toolkit",
            slug="mesh-toolkit",
            short_description="Mesh helpers",
            price=Decimal("19.00"),
            status=Plugin.Status.PUBLISHED,
        )

    def test_plugin_list_search(self) -> None:
        response = self.client.get(
            reverse("plugins:plugin-list"),
            {"search": "mesh"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "mesh-toolkit")
