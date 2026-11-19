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
# The starting share of the base price (hours x rate) each package costs, in percent. The admin
# changes them on the Pricing page (products.pricing.get_default_percents); a model can override
# any of them. Whole File is the anchor: the other packages together cost more than it.
DEFAULT_PACKAGE_PERCENTS: dict[str, Decimal] = {
    PackageKind.WITH_LIGHT_RIG: Decimal("60"),
    PackageKind.WITHOUT_LIGHT_RIG: Decimal("50"),
    PackageKind.GLB_ONLY: Decimal("25"),
    PackageKind.ENVIRONMENT: Decimal("30"),
    PackageKind.WHOLE: Decimal("100"),
}


def line_title(name: str, kind: str) -> str:
    """A cart or order line's title: "<model name> - <package label>" (the model name alone
    for a line with no package, such as a plugin)."""
    label = PACKAGE_LABELS.get(kind, "")
    return f"{name} - {label}" if label else name


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


def bundle_warning(effective_prices: dict[str, Decimal]) -> str:
    """Why the Whole File price looks wrong, or "" (a warning on the Pricing page, never a block).

    ``effective_prices`` holds what a buyer pays now for each priced package, by kind. Whole File
    should cost less than the other packages added together, and not less than the single most
    expensive one (it holds all of them). Checked only with Whole File and at least one other.
    """
    others = {kind: price for kind, price in effective_prices.items() if kind != PackageKind.WHOLE}
    whole = effective_prices.get(PackageKind.WHOLE)
    if whole is None or not others:
        return ""
    together = sum(others.values(), Decimal("0.00"))
    if whole >= together:
        return (
            f"Whole File ({whole:.2f}) is not cheaper than the other packages together "
            f"({together:.2f})."
        )
    top_kind = max(others, key=lambda kind: (others[kind], -PACKAGE_ORDER.index(kind)))
    if whole < others[top_kind]:
        return (
            f"Whole File ({whole:.2f}) costs less than {PACKAGE_LABELS[top_kind]} alone "
            f"({others[top_kind]:.2f})."
        )
    return ""

