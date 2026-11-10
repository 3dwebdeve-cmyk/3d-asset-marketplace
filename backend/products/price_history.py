"""Price history: one ProductPriceChange row for every change to a model's price.

Every code path that changes ``price``, ``discount_price`` or ``discount_ends_at`` takes a
``PriceState.of(product)`` before the change and calls ``record_price_change`` after saving,
inside the same transaction. Nothing is written when the three values did not change.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from products.models import Product, ProductPriceChange


@dataclass(frozen=True)
class PriceState:
    price: Decimal | None
    discount_price: Decimal | None
    discount_ends_at: datetime | None

    @classmethod
    def of(cls, product: Product) -> PriceState:
        return cls(product.price, product.discount_price, product.discount_ends_at)


def record_price_change(
    product: Product,
    before: PriceState,
    *,
    source: str,
    actor=None,
    batch_id: str = "",
) -> ProductPriceChange | None:
    """Write one history row if the price, sale price or sale end changed since ``before``.

    ``actor`` is the signed-in administrator (None for the uploader import and for the
    maintenance loop ending a sale). ``source`` is a ``ProductPriceChange.Source`` value.
    """
    after = PriceState.of(product)
    if after == before:
        return None
    if source not in ProductPriceChange.Source.values:
        raise ValueError(f"Unknown price change source: {source!r}")
    return ProductPriceChange.objects.create(
        product=product,
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
