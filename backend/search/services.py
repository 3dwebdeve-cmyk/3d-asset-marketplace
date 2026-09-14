from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from plugins.models import Plugin
from products.models import Product
from search.client import get_client
from search.documents import PLUGINS_INDEX, PRODUCTS_INDEX
from search.indexer import ensure_indexes

logger = logging.getLogger(__name__)

MAX_QUERY_LENGTH = 100

PRODUCT_SORT_MAP = {
    "name": "name:asc",
    "-name": "name:desc",
    "price": "price:asc",
    "-price": "price:desc",
    "created_at": "created_at:asc",
    "-created_at": "created_at:desc",
    "total_downloads": "total_downloads:asc",
    "-total_downloads": "total_downloads:desc",
    "review_count": "review_count:asc",
    "-review_count": "review_count:desc",
}

PLUGIN_SORT_MAP = {
    "name": "name:asc",
    "-name": "name:desc",
    "price": "price:asc",
    "-price": "price:desc",
    "created_at": "created_at:asc",
    "-created_at": "created_at:desc",
}


@dataclass(frozen=True)
class SearchPage:
    ids: list[UUID]
    estimated_total: int
    page: int
    page_size: int


def normalize_query(search: str | None) -> str | None:
    if not search:
        return None
    query = search.strip()
    if not query:
        return None
    return query[:MAX_QUERY_LENGTH]


def build_product_filters(
    *,
    category_id: UUID | None = None,
    animated: bool | None = None,
    rigged: bool | None = None,
    pbr_ready: bool | None = None,
    game_ready: bool | None = None,
) -> str | None:
    clauses: list[str] = []
    if category_id is not None:
        clauses.append(f'category_id = "{category_id}"')
    for name, value in (
        ("animated", animated),
        ("rigged", rigged),
        ("pbr_ready", pbr_ready),
        ("game_ready", game_ready),
    ):
        if value is not None:
            clauses.append(f"{name} = {str(value).lower()}")
    return " AND ".join(clauses) if clauses else None


def build_plugin_filters(*, category_id: UUID | None = None) -> str | None:
    if category_id is None:
        return None
    return f'category_id = "{category_id}"'


def map_product_sort(ordering: str | None) -> list[str]:
    key = ordering if ordering in PRODUCT_SORT_MAP else "-created_at"
    return [PRODUCT_SORT_MAP[key]]


def map_plugin_sort(ordering: str | None) -> list[str]:
    key = ordering if ordering in PLUGIN_SORT_MAP else "-created_at"
    return [PLUGIN_SORT_MAP[key]]


def search_published_products(
    *,
    query: str,
    page: int,
    page_size: int,
    category_id: UUID | None = None,
    ordering: str | None = None,
    animated: bool | None = None,
    rigged: bool | None = None,
    pbr_ready: bool | None = None,
    game_ready: bool | None = None,
) -> SearchPage | None:
    return _search_index(
        index_uid=PRODUCTS_INDEX,
        query=query,
        page=page,
        page_size=page_size,
        sort=map_product_sort(ordering),
        filters=build_product_filters(
            category_id=category_id,
            animated=animated,
            rigged=rigged,
            pbr_ready=pbr_ready,
            game_ready=game_ready,
        ),
    )


def search_published_plugins(
    *,
    query: str,
    page: int,
    page_size: int,
    category_id: UUID | None = None,
    ordering: str | None = None,
) -> SearchPage | None:
    return _search_index(
        index_uid=PLUGINS_INDEX,
        query=query,
        page=page,
        page_size=page_size,
        sort=map_plugin_sort(ordering),
        filters=build_plugin_filters(category_id=category_id),
    )


def hydrate_products(ids: list[UUID]) -> list[Product]:
    return _hydrate(
        Product.objects.select_related("category").filter(
            pk__in=ids,
            status=Product.Status.PUBLISHED,
        ),
        ids,
    )


def hydrate_plugins(ids: list[UUID]) -> list[Plugin]:
    return _hydrate(
        Plugin.objects.select_related("category").filter(
            pk__in=ids,
            status=Plugin.Status.PUBLISHED,
            category__is_active=True,
        ),
        ids,
    )


def _hydrate(queryset, ids: list[UUID]):
    if not ids:
        return []
    found = {item.pk: item for item in queryset}
    return [found[item_id] for item_id in ids if item_id in found]


def _search_index(
    *,
    index_uid: str,
    query: str,
    page: int,
    page_size: int,
    sort: list[str],
    filters: str | None,
) -> SearchPage | None:
    client = get_client()
    if client is None:
        return None
    try:
        ensure_indexes(client)
        params: dict[str, Any] = {
            "offset": (page - 1) * page_size,
            "limit": page_size,
            "sort": sort,
            "attributesToRetrieve": ["id"],
        }
        if filters:
            params["filter"] = filters
        result = client.index(index_uid).search(query, params)
        hits = result.get("hits") if isinstance(result, dict) else None
        if hits is None:
            hits = getattr(result, "hits", []) or []
        ids: list[UUID] = []
        for hit in hits:
            raw_id = hit.get("id") if isinstance(hit, dict) else getattr(hit, "id", None)
            if not raw_id:
                continue
            ids.append(UUID(str(raw_id)))
        total = 0
        if isinstance(result, dict):
            total = int(result.get("estimatedTotalHits") or result.get("totalHits") or 0)
        else:
            total = int(
                getattr(result, "estimated_total_hits", None)
                or getattr(result, "estimatedTotalHits", None)
                or 0
            )
        return SearchPage(
            ids=ids,
            estimated_total=total,
            page=page,
            page_size=page_size,
        )
    except Exception:
        logger.exception("meilisearch_search_failed index=%s", index_uid)
        return None
