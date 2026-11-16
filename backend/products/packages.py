"""The packages a model is sold in: one zip each, with its own price (docs/PACKAGES_PIPELINE.md).

This is the only list of package kinds. The import, pricing, cart, checkout, downloads and
serializers all loop over it; never write the kinds out again anywhere else.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from django.db import models

if TYPE_CHECKING:
    from products.models import Product


class PackageKind(models.TextChoices):
    """The order here is the order every screen lists the packages in (PACKAGE_ORDER)."""

    WITH_LIGHT_RIG = "with_light_rig", "With Light Rig"
    WITHOUT_LIGHT_RIG = "without_light_rig", "Without Light Rig"
    GLB_ONLY = "glb_only", "GLB Only"
    ENVIRONMENT = "environment", "With Environment"
    WHOLE = "whole", "Whole File"


PACKAGE_ORDER: tuple[str, ...] = tuple(PackageKind.values)
PACKAGE_KINDS: frozenset[str] = frozenset(PACKAGE_ORDER)
PACKAGE_LABELS: dict[str, str] = dict(PackageKind.choices)
# What a buyer gets in each package, shown beside its price.
PACKAGE_DESCRIPTIONS: dict[str, str] = {
    PackageKind.WITH_LIGHT_RIG: "The model with its textures and the studio light rig.",
    PackageKind.WITHOUT_LIGHT_RIG: "The model with its textures, without any lights.",
    PackageKind.GLB_ONLY: "A single GLB file with its textures, for web, AR and game engines.",
    PackageKind.ENVIRONMENT: "The model placed in its environment scene.",
    PackageKind.WHOLE: "Everything in one download: every package of this model.",
}


def sync_summary_price(product: Product) -> None:
    """Keep the product's price fields equal to its cheapest priced package.

    ``Product.price`` / ``discount_price`` / ``discount_ends_at`` are a summary that keeps the
    price filters, sorting and ``is_free`` working; nobody types them. The summary is the
    lowest regular price among the priced packages, with that package's sale. With no priced
    package it is 0 and no sale (a paid model waiting for its prices, as before packages).
    A tie goes to the package listed first in PACKAGE_ORDER. Call after every package change.
    """
    priced = [
        row
        for row in product.files.filter(is_preview=False).exclude(package_kind="")
        if row.price is not None
    ]
    cheapest = min(
        priced,
        key=lambda row: (row.price, PACKAGE_ORDER.index(row.package_kind)),
        default=None,
    )
    if cheapest is None:
        summary = (Decimal("0.00"), None, None)
    else:
        summary = (cheapest.price, cheapest.discount_price, cheapest.discount_ends_at)
    if summary == (product.price, product.discount_price, product.discount_ends_at):
        return
    product.price, product.discount_price, product.discount_ends_at = summary
    product.save(update_fields=["price", "discount_price", "discount_ends_at", "updated_at"])
