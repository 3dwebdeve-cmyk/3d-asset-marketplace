from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.test import TestCase

from categories.models import Category
from plugins.models import Plugin, PluginCategory
from plugins.services import PluginCreateData, PluginService
from products.models import Product
from products.services import ProductCreateData, ProductService
from search.documents import PLUGINS_INDEX, PRODUCTS_INDEX, product_document
from search.indexer import (
    reset_index_ready_for_tests,
    sync_plugin,
    sync_product,
    sync_product_by_id,
)


class IndexerSyncTests(TestCase):
    def setUp(self) -> None:
        reset_index_ready_for_tests()
        self.category = Category.objects.create(name="Furniture", slug="furniture")
        self.product = Product.objects.create(
            category=self.category,
            name="Oak Chair",
            slug="oak-chair",
            price=Decimal("29.99"),
            status=Product.Status.PUBLISHED,
        )
        self.plugin_category = PluginCategory.objects.create(
            name="Blender",
            slug="blender",
        )
        self.plugin = Plugin.objects.create(
            category=self.plugin_category,
            name="Mesh Toolkit",
            slug="mesh-toolkit",
            price=Decimal("19.00"),
            status=Plugin.Status.PUBLISHED,
        )

    def _mock_client(self) -> tuple[MagicMock, MagicMock]:
        client = MagicMock()
        index = MagicMock()
        client.index.return_value = index
        return client, index

    @patch("search.indexer.get_client")
    def test_published_product_is_upserted(self, get_client: MagicMock) -> None:
        client, index = self._mock_client()
        get_client.return_value = client

        sync_product(self.product)

        index.add_documents.assert_called_once_with(
            [product_document(self.product)],
            primary_key="id",
        )
        index.delete_document.assert_not_called()

    @patch("search.indexer.get_client")
    def test_unpublished_product_is_deleted(self, get_client: MagicMock) -> None:
        client, index = self._mock_client()
        get_client.return_value = client
        self.product.status = Product.Status.DRAFT
        self.product.save(update_fields=["status", "updated_at"])

        sync_product(self.product)

        index.delete_document.assert_called_once_with(str(self.product.pk))
        index.add_documents.assert_not_called()

    @patch("search.indexer.get_client")
    def test_missing_product_deletes_document(self, get_client: MagicMock) -> None:
        client, index = self._mock_client()
        get_client.return_value = client
        missing_id = uuid4()

        sync_product_by_id(missing_id)

        client.index.assert_called_with(PRODUCTS_INDEX)
        index.delete_document.assert_called_once_with(str(missing_id))

    @patch("search.indexer.get_client")
    def test_unpublished_plugin_is_deleted(self, get_client: MagicMock) -> None:
        client, index = self._mock_client()
        get_client.return_value = client
        self.plugin.status = Plugin.Status.ARCHIVED
        self.plugin.save(update_fields=["status", "updated_at"])

        sync_plugin(self.plugin)

        client.index.assert_called_with(PLUGINS_INDEX)
        index.delete_document.assert_called_once_with(str(self.plugin.pk))

    @patch("search.indexer.get_client")
    def test_sync_swallows_meili_errors(self, get_client: MagicMock) -> None:
        get_client.return_value = MagicMock()
        get_client.return_value.index.side_effect = RuntimeError("meili down")

        sync_product(self.product)

    @patch("search.indexer.get_client")
    def test_unconfigured_client_is_noop(self, get_client: MagicMock) -> None:
        get_client.return_value = None
        sync_product(self.product)
        get_client.assert_called()

    @patch("products.services.enqueue_sync_product")
    def test_create_product_syncs_index(self, sync_mock: MagicMock) -> None:
        created = ProductService.create_product(
            ProductCreateData(
                category_id=self.category.pk,
                name="New Chair",
                price=Decimal("12.00"),
                status=Product.Status.PUBLISHED,
            )
        )
        sync_mock.assert_called_once_with(created.pk)
        self.assertEqual(created.status, Product.Status.PUBLISHED)

    @patch("products.services.enqueue_sync_product")
    def test_archive_product_syncs_index(self, sync_mock: MagicMock) -> None:
        archived = ProductService.archive_product(self.product)
        sync_mock.assert_called_with(archived.pk)
        self.assertEqual(archived.status, Product.Status.ARCHIVED)

    @patch("plugins.services.enqueue_sync_plugin")
    def test_create_plugin_enqueues_index(self, sync_mock: MagicMock) -> None:
        created = PluginService.create_plugin(
            PluginCreateData(
                category_id=self.plugin_category.pk,
                name="Enqueue Toolkit",
                price=Decimal("8.00"),
            )
        )
        sync_mock.assert_called_once_with(created.pk)
