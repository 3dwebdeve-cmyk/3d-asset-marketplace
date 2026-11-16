"""Price history: one ProductPriceChange row for every change to a price.

Every code path that changes ``price``, ``discount_price`` or ``discount_ends_at`` of a product
or of one of its packages takes a ``PriceState.of(...)`` before the change and calls
``record_price_change`` after saving, inside the same transaction. Nothing is written when the
three values did not change. A package's row carries its ``package_kind``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from products.models import PricedMixin, Product, ProductFile, ProductPriceChange


@dataclass(frozen=True)
class PriceState:
    price: Decimal | None
    discount_price: Decimal | None
    discount_ends_at: datetime | None

    @classmethod
    def of(cls, priced: PricedMixin) -> PriceState:
        return cls(priced.price, priced.discount_price, priced.discount_ends_at)


def record_price_change(
    priced: Product | ProductFile,
    before: PriceState,
    *,
    source: str,
    actor=None,
    batch_id: str = "",
) -> ProductPriceChange | None:
    """Write one history row if the price, sale price or sale end changed since ``before``.

    ``priced`` is a product or one of its packages. ``actor`` is the signed-in administrator
    (None for the uploader import and for the maintenance loop ending a sale). ``source`` is a
    ``ProductPriceChange.Source`` value.
    """
    after = PriceState.of(priced)
    if after == before:
        return None
    if source not in ProductPriceChange.Source.values:
        raise ValueError(f"Unknown price change source: {source!r}")
    product = priced.product if isinstance(priced, ProductFile) else priced
    return ProductPriceChange.objects.create(
        product=product,
        package_kind=priced.package_kind if isinstance(priced, ProductFile) else "",
        changed_by=actor,
        source=source,
        batch_id=(batch_id or "")[:64],
        currency=product.currency,
        old_price=before.price,
        new_price=after.price,
        old_discount_price=before.discount_price,
        new_discount_price=after.discount_price,
        old_discount_ends_at=before.discount_ends_at,
        new_discount_ends_at=after.discount_ends_at,
    )
