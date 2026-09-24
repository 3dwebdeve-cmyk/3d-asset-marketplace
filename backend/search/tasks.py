"""No-op search index sync (Meilisearch removed; Postgres search needs no index)."""

from __future__ import annotations

from uuid import UUID

from celery import shared_task


@shared_task(
    name="search.sync_product",
    ignore_result=True,
)
def sync_product_task(product_id: str) -> None:
    del product_id


@shared_task(
    name="search.sync_plugin",
    ignore_result=True,
)
def sync_plugin_task(plugin_id: str) -> None:
    del plugin_id


def enqueue_sync_product(product_id: UUID | str) -> None:
    del product_id


def enqueue_sync_plugin(plugin_id: UUID | str) -> None:
    del plugin_id
