"""No-op indexer stubs (Meilisearch removed)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from plugins.models import Plugin
from products.models import Product


def ensure_indexes(client: Any = None) -> None:
    del client


def sync_product(product: Product) -> None:
    del product


def sync_product_by_id(product_id: UUID) -> None:
    del product_id


def sync_plugin(plugin: Plugin) -> None:
    del plugin


def sync_plugin_by_id(plugin_id: UUID) -> None:
    del plugin_id


def delete_document(index_uid: str, document_id: UUID | str) -> None:
    del index_uid, document_id


def reindex_all() -> tuple[int, int]:
    """Return (0, 0) — nothing to push without Meilisearch."""
    return 0, 0
