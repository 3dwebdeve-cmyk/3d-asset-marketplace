from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from categories.models import Category
from plugins.models import Plugin, PluginCategory
from products.models import Product
from search.services import SearchPage, hydrate_products, search_published_products


MEILI_SETTINGS = {
    "MEILI_URL": "http://127.0.0.1:7700",
    "MEILI_MASTER_KEY": "test-key",
}


class MeiliPublicSearchApiTests(APITestCase):
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

    def _client_with_hits(self, ids: list, total: int) -> MagicMock:
        client = MagicMock()
        index = MagicMock()
        index.search.return_value = {
            "hits": [{"id": str(item_id)} for item_id in ids],
            "estimatedTotalHits": total,
        }
        client.index.return_value = index
        return client

    @override_settings(**MEILI_SETTINGS)
    @patch("search.services.get_client")
    def test_list_uses_meili_ids_and_total(self, get_client: MagicMock) -> None:
        get_client.return_value = self._client_with_hits([self.table.pk], 7)

        response = self.client.get(self.list_url, {"search": "pine"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 7)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["slug"], "pine-table")

    @override_settings(**MEILI_SETTINGS)
    @patch("search.services.get_client")
    def test_hydrate_drops_unpublished_hits(self, get_client: MagicMock) -> None:
        get_client.return_value = self._client_with_hits(
            [self.draft.pk, self.chair.pk],
            2,
        )

        response = self.client.get(self.list_url, {"search": "wooden"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        slugs = [item["slug"] for item in response.data["results"]]
        self.assertEqual(slugs, ["oak-chair"])
        self.assertEqual(response.data["count"], 2)

    @override_settings(**MEILI_SETTINGS, MEILI_REQUIRED=False)
    @patch("search.services.get_client")
    def test_meili_error_falls_back_to_postgres(self, get_client: MagicMock) -> None:
        client = MagicMock()
        client.index.side_effect = RuntimeError("meili down")
        get_client.return_value = client

        response = self.client.get(self.list_url, {"search": "wooden"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "oak-chair")

    @override_settings(**MEILI_SETTINGS, MEILI_REQUIRED=True)
    @patch("search.services.get_client")
    def test_meili_error_returns_503_when_required(self, get_client: MagicMock) -> None:
        client = MagicMock()
        client.index.side_effect = RuntimeError("meili down")
        get_client.return_value = client

        response = self.client.get(self.list_url, {"search": "wooden"})

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["code"], "search_unavailable")

    @override_settings(MEILI_REQUIRED=True, MEILI_URL="", MEILI_MASTER_KEY="")
    def test_search_returns_503_when_meili_required_but_unconfigured(self) -> None:
        response = self.client.get(self.list_url, {"search": "wooden"})
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["code"], "search_unavailable")

    def test_empty_search_does_not_use_meili(self) -> None:
        with patch("search.services.get_client") as get_client:
            response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        get_client.assert_not_called()

    def test_hydrate_preserves_meili_order(self) -> None:
        ordered = hydrate_products([self.table.pk, self.chair.pk])
        self.assertEqual([item.slug for item in ordered], ["pine-table", "oak-chair"])


class MeiliPluginSearchApiTests(APITestCase):
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

    @override_settings(**MEILI_SETTINGS)
    @patch("search.services.get_client")
    def test_plugin_list_uses_meili(self, get_client: MagicMock) -> None:
        client = MagicMock()
        index = MagicMock()
        index.search.return_value = {
            "hits": [{"id": str(self.plugin.pk)}],
            "estimatedTotalHits": 1,
        }
        client.index.return_value = index
        get_client.return_value = client

        response = self.client.get(
            reverse("plugins:plugin-list"),
            {"search": "mesh"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], "mesh-toolkit")


class SearchServiceClientTests(APITestCase):
    @override_settings(**MEILI_SETTINGS)
    @patch("search.services.get_client")
    def test_search_passes_filters_and_sort(self, get_client: MagicMock) -> None:
        category_id = uuid4()
        product_id = uuid4()
        client = MagicMock()
        index = MagicMock()
        index.search.return_value = {
            "hits": [{"id": str(product_id)}],
            "estimatedTotalHits": 1,
        }
        client.index.return_value = index
        get_client.return_value = client

        page = search_published_products(
            query="chair",
            page=2,
            page_size=10,
            category_id=category_id,
            ordering="price",
            animated=True,
        )

        self.assertIsInstance(page, SearchPage)
        self.assertEqual(page.ids, [product_id])
        index.search.assert_called_once()
        args, kwargs = index.search.call_args
        self.assertEqual(args[0], "chair")
        params = args[1] if len(args) > 1 else kwargs
        self.assertEqual(params["offset"], 10)
        self.assertEqual(params["limit"], 10)
        self.assertEqual(params["sort"], ["price:asc"])
        self.assertIn(f'category_id = "{category_id}"', params["filter"])
        self.assertIn("animated = true", params["filter"])
