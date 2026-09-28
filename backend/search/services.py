"""Catalog helpers. Search is Postgres-only (Meilisearch removed).

``search_published_*`` always returns ``None`` so list views use
``ProductService`` / ``PluginService`` ``icontains`` queries.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from plugins.models import Plugin
from products.models import Product

MAX_QUERY_LENGTH = 100
# Single-character icontains matches nearly every row and is a cheap DB-load lever.
MIN_QUERY_LENGTH = 2


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
    if len(query) < MIN_QUERY_LENGTH:
        return None
    return query[:MAX_QUERY_LENGTH]


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
    del query, page, page_size, category_id, ordering
    del animated, rigged, pbr_ready, game_ready
    return None


def search_published_plugins(
    *,
    query: str,
    page: int,
    page_size: int,
    category_id: UUID | None = None,
    ordering: str | None = None,
) -> SearchPage | None:
    del query, page, page_size, category_id, ordering
    return None


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
