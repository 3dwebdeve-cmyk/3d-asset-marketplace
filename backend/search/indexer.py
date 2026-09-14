from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any
from uuid import UUID

from plugins.models import Plugin
from products.models import Product
from search.client import get_client
from search.documents import (
    PLUGIN_INDEX_SETTINGS,
    PLUGINS_INDEX,
    PRODUCT_INDEX_SETTINGS,
    PRODUCTS_INDEX,
    plugin_document,
    product_document,
)

logger = logging.getLogger(__name__)

_INDEX_BATCH_SIZE = 500
_indexes_ready = False


def reset_index_ready_for_tests() -> None:
    global _indexes_ready
    _indexes_ready = False


def _wait_for_task(client: Any, task: Any) -> None:
    uid = getattr(task, "task_uid", None)
    if uid is None and isinstance(task, dict):
        uid = task.get("taskUid") or task.get("task_uid")
    if uid is None:
        return
    waiter = getattr(client, "wait_for_task", None)
    if waiter is None:
        return
    waiter(uid)


def ensure_indexes(client: Any, *, force: bool = False) -> None:
    global _indexes_ready
    if _indexes_ready and not force:
        return
    client.index(PRODUCTS_INDEX).update_settings(PRODUCT_INDEX_SETTINGS)
    client.index(PLUGINS_INDEX).update_settings(PLUGIN_INDEX_SETTINGS)
    _indexes_ready = True


def sync_product(product: Product) -> None:
    client = get_client()
    if client is None:
        return
    try:
        ensure_indexes(client)
        index = client.index(PRODUCTS_INDEX)
        if product.status == Product.Status.PUBLISHED:
            index.add_documents([product_document(product)])
        else:
            index.delete_document(str(product.pk))
    except Exception:
        logger.exception("meilisearch_sync_product_failed id=%s", product.pk)


def sync_product_by_id(product_id: UUID) -> None:
    product = Product.objects.filter(pk=product_id).first()
    if product is None:
        _delete_document(PRODUCTS_INDEX, product_id)
        return
    sync_product(product)


def sync_plugin(plugin: Plugin) -> None:
    client = get_client()
    if client is None:
        return
    try:
        ensure_indexes(client)
        index = client.index(PLUGINS_INDEX)
        public = (
            plugin.status == Plugin.Status.PUBLISHED
            and plugin.category_id is not None
            and getattr(plugin.category, "is_active", True)
        )
        if public:
            index.add_documents([plugin_document(plugin)])
        else:
            index.delete_document(str(plugin.pk))
    except Exception:
        logger.exception("meilisearch_sync_plugin_failed id=%s", plugin.pk)


def sync_plugin_by_id(plugin_id: UUID) -> None:
    plugin = Plugin.objects.select_related("category").filter(pk=plugin_id).first()
    if plugin is None:
        _delete_document(PLUGINS_INDEX, plugin_id)
        return
    sync_plugin(plugin)


def _delete_document(index_uid: str, document_id: UUID) -> None:
    client = get_client()
    if client is None:
        return
    try:
        ensure_indexes(client)
        client.index(index_uid).delete_document(str(document_id))
    except Exception:
        logger.exception(
            "meilisearch_delete_failed index=%s id=%s",
            index_uid,
            document_id,
        )


def reindex_all(*, wait: bool = True) -> tuple[int, int]:
    """Replace public catalog documents. Returns (product_count, plugin_count)."""
    client = get_client()
    if client is None:
        raise RuntimeError("MEILI_URL is not set.")
    ensure_indexes(client, force=True)
    product_count = _rebuild_index(
        client,
        PRODUCTS_INDEX,
        (
            product_document(product)
            for product in Product.objects.filter(
                status=Product.Status.PUBLISHED
            ).iterator(chunk_size=_INDEX_BATCH_SIZE)
        ),
        wait=wait,
    )
    plugin_count = _rebuild_index(
        client,
        PLUGINS_INDEX,
        (
            plugin_document(plugin)
            for plugin in Plugin.objects.select_related("category")
            .filter(
                status=Plugin.Status.PUBLISHED,
                category__is_active=True,
            )
            .iterator(chunk_size=_INDEX_BATCH_SIZE)
        ),
        wait=wait,
    )
    return product_count, plugin_count


def _rebuild_index(
    client: Any,
    index_uid: str,
    documents: Iterable[dict[str, Any]],
    *,
    wait: bool,
) -> int:
    index = client.index(index_uid)
    delete_task = index.delete_all_documents()
    if wait:
        _wait_for_task(client, delete_task)
    batch: list[dict[str, Any]] = []
    count = 0
    for document in documents:
        batch.append(document)
        if len(batch) >= _INDEX_BATCH_SIZE:
            task = index.add_documents(batch)
            if wait:
                _wait_for_task(client, task)
            count += len(batch)
            batch = []
    if batch:
        task = index.add_documents(batch)
        if wait:
            _wait_for_task(client, task)
        count += len(batch)
    return count
