"""Read-only orphan check for polymorphic catalog FKs (product_type + UUID)."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from django.db.models import QuerySet

from cart.models import CartItem
from downloads.models import DownloadHistory
from orders.models import OrderItem
from plugins.models import Plugin
from products.models import Product
from reviews.models import Review
from wishlist.models import WishlistItem


@dataclass(frozen=True)
class OrphanBucket:
    name: str
    product_orphans: int
    plugin_orphans: int
    blocking: bool

    @property
    def total(self) -> int:
        return self.product_orphans + self.plugin_orphans


@dataclass(frozen=True)
class CatalogIntegrityReport:
    buckets: tuple[OrphanBucket, ...]

    @property
    def blocking_orphans(self) -> int:
        return sum(bucket.total for bucket in self.buckets if bucket.blocking)

    @property
    def advisory_orphans(self) -> int:
        return sum(bucket.total for bucket in self.buckets if not bucket.blocking)

    @property
    def ok(self) -> bool:
        return self.blocking_orphans == 0


def _ids_for_type(queryset: QuerySet, product_type: str) -> set[UUID]:
    return {
        item_id
        for item_id in queryset.filter(product_type=product_type).values_list(
            "product_id", flat=True
        )
        if item_id is not None
    }


def _count_missing(ids: set[UUID], existing: set[UUID]) -> int:
    if not ids:
        return 0
    return len(ids - existing)


def _bucket_for_queryset(
    *,
    name: str,
    queryset: QuerySet,
    product_ids: set[UUID],
    plugin_ids: set[UUID],
    blocking: bool,
) -> OrphanBucket:
    return OrphanBucket(
        name=name,
        product_orphans=_count_missing(
            _ids_for_type(queryset, "product"),
            product_ids,
        ),
        plugin_orphans=_count_missing(
            _ids_for_type(queryset, "plugin"),
            plugin_ids,
        ),
        blocking=blocking,
    )


def collect_catalog_integrity_report() -> CatalogIntegrityReport:
    product_ids = set(Product.objects.values_list("id", flat=True))
    plugin_ids = set(Plugin.objects.values_list("id", flat=True))
    buckets = (
        _bucket_for_queryset(
            name="cart_items",
            queryset=CartItem.objects.all(),
            product_ids=product_ids,
            plugin_ids=plugin_ids,
            blocking=True,
        ),
        _bucket_for_queryset(
            name="wishlist_items",
            queryset=WishlistItem.objects.all(),
            product_ids=product_ids,
            plugin_ids=plugin_ids,
            blocking=True,
        ),
        _bucket_for_queryset(
            name="reviews",
            queryset=Review.objects.all(),
            product_ids=product_ids,
            plugin_ids=plugin_ids,
            blocking=True,
        ),
        _bucket_for_queryset(
            name="order_items",
            queryset=OrderItem.objects.all(),
            product_ids=product_ids,
            plugin_ids=plugin_ids,
            blocking=False,
        ),
        _bucket_for_queryset(
            name="download_history",
            queryset=DownloadHistory.objects.all(),
            product_ids=product_ids,
            plugin_ids=plugin_ids,
            blocking=False,
        ),
    )
    return CatalogIntegrityReport(buckets=buckets)
