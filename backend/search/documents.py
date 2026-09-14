from __future__ import annotations

from typing import Any

from plugins.models import Plugin
from products.models import Product

PRODUCTS_INDEX = "products"
PLUGINS_INDEX = "plugins"

PRODUCT_INDEX_SETTINGS: dict[str, list[str]] = {
    "searchableAttributes": [
        "name",
        "short_description",
        "description",
        "software_used",
    ],
    "filterableAttributes": [
        "category_id",
        "animated",
        "rigged",
        "pbr_ready",
        "game_ready",
    ],
    "sortableAttributes": [
        "name",
        "price",
        "created_at",
        "total_downloads",
        "review_count",
    ],
}

PLUGIN_INDEX_SETTINGS: dict[str, list[str]] = {
    "searchableAttributes": [
        "name",
        "short_description",
        "description",
        "compatibility",
    ],
    "filterableAttributes": [
        "category_id",
    ],
    "sortableAttributes": [
        "name",
        "price",
        "created_at",
        "total_downloads",
        "review_count",
    ],
}


def _unix_ts(value: Any) -> int:
    if value is None:
        return 0
    return int(value.timestamp())


def product_document(product: Product) -> dict[str, Any]:
    return {
        "id": str(product.pk),
        "name": product.name,
        "slug": product.slug,
        "short_description": product.short_description or "",
        "description": product.description or "",
        "software_used": product.software_used or "",
        "category_id": str(product.category_id),
        "price": float(product.price),
        "animated": bool(product.animated),
        "rigged": bool(product.rigged),
        "pbr_ready": bool(product.pbr_ready),
        "game_ready": bool(product.game_ready),
        "average_rating": float(product.average_rating),
        "review_count": int(product.review_count),
        "total_downloads": int(product.total_downloads),
        "created_at": _unix_ts(product.created_at),
    }


def plugin_document(plugin: Plugin) -> dict[str, Any]:
    return {
        "id": str(plugin.pk),
        "name": plugin.name,
        "slug": plugin.slug,
        "short_description": plugin.short_description or "",
        "description": plugin.description or "",
        "compatibility": plugin.compatibility or "",
        "category_id": str(plugin.category_id),
        "price": float(plugin.price),
        "average_rating": float(plugin.average_rating),
        "review_count": int(plugin.review_count),
        "total_downloads": int(plugin.total_downloads),
        "created_at": _unix_ts(plugin.created_at),
    }
