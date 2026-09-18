"""Celery tasks for Meilisearch catalog sync (Phase E2).

Tasks wrap ``search.indexer.sync_*_by_id`` — indexer logic is not duplicated.
Failures are logged inside the indexer; repair is ``manage.py reindex_search``.
Default Celery queue (worker: ``-Q celery,email``) so search does not block mail.
"""

from __future__ import annotations

import logging
from uuid import UUID

from celery import shared_task

from config.celery_utils import enqueue_after_commit

logger = logging.getLogger("search.tasks")


def _parse_uuid(raw_id: str, *, kind: str) -> UUID | None:
    try:
        return UUID(str(raw_id))
    except (TypeError, ValueError, AttributeError):
        logger.warning(
            "search_sync_skipped reason=invalid_id kind=%s id=%s",
            kind,
            raw_id,
        )
        return None


@shared_task(
    ignore_result=True,
    name="search.sync_product",
)
def sync_product_task(product_id: str) -> None:
    from search.indexer import sync_product_by_id

    parsed = _parse_uuid(product_id, kind="product")
    if parsed is None:
        return
    sync_product_by_id(parsed)


@shared_task(
    ignore_result=True,
    name="search.sync_plugin",
)
def sync_plugin_task(plugin_id: str) -> None:
    from search.indexer import sync_plugin_by_id

    parsed = _parse_uuid(plugin_id, kind="plugin")
    if parsed is None:
        return
    sync_plugin_by_id(parsed)


def enqueue_sync_product(product_id: UUID | str) -> None:
    """Schedule product index sync after the current DB transaction commits."""
    enqueue_after_commit(sync_product_task, str(product_id))


def enqueue_sync_plugin(plugin_id: UUID | str) -> None:
    """Schedule plugin index sync after the current DB transaction commits."""
    enqueue_after_commit(sync_plugin_task, str(plugin_id))
