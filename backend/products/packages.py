"""The packages a model is sold in: one zip each, with its own price (docs/PACKAGES_PIPELINE.md).

This is the only list of package kinds. The import, pricing, cart, checkout, downloads and
serializers all loop over it; never write the kinds out again anywhere else.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import TYPE_CHECKING, Any, Iterable

from django.db import models

if TYPE_CHECKING:
    from products.models import Product, ProductFile


class PackageKind(models.TextChoices):
    """The order here is the order every screen lists the packages in (PACKAGE_ORDER)."""

    WITH_LIGHT_RIG = "with_light_rig", "With Light Rig"
    WITHOUT_LIGHT_RIG = "without_light_rig", "Without Light Rig"
    GLB_ONLY = "glb_only", "GLB Only"
    THREE_DS_MAX = "3ds_max", "3ds Max"
    ENVIRONMENT = "environment", "With Environment"
    WHOLE = "whole", "Whole File"


PACKAGE_ORDER: tuple[str, ...] = tuple(PackageKind.values)
PACKAGE_KINDS: frozenset[str] = frozenset(PACKAGE_ORDER)

# The packages a buyer picks one by one when a model has variations. Whole File is then the zip
# that holds them all: no admin prices it, and All variations delivers it. A model whose only zip
# is the Whole File zip is a single-zip model: that zip is its one package, priced and sold as is.
SINGLE_KINDS: tuple[str, ...] = tuple(kind for kind in PACKAGE_ORDER if kind != PackageKind.WHOLE)

# The line that buys every variation a model has at once: it is delivered as the Whole File zip,
# and the buyer gets BUNDLE_DISCOUNT_PERCENT off the packages' total. It is not a package.
BUNDLE_KIND = "bundle"
BUNDLE_DISCOUNT_PERCENT = Decimal("25")
# Every kind a cart or order line may be sold as. Whole File is one only for a single-zip model
# (the cart and checkout refuse it for a model with variations).
LINE_KINDS: tuple[str, ...] = (*SINGLE_KINDS, PackageKind.WHOLE, BUNDLE_KIND)
LINE_KIND_CHOICES: list[tuple[str, str]] = [*PackageKind.choices, (BUNDLE_KIND, "All variations")]

PACKAGE_LABELS: dict[str, str] = dict(LINE_KIND_CHOICES)
# What a buyer gets in each package, shown beside its price.
PACKAGE_DESCRIPTIONS: dict[str, str] = {
    PackageKind.WITH_LIGHT_RIG: "The model with its textures and the studio light rig.",
    PackageKind.WITHOUT_LIGHT_RIG: "The model with its textures, without any lights.",
    PackageKind.GLB_ONLY: "A single GLB file with its textures, for web, AR and game engines.",
    PackageKind.THREE_DS_MAX: "The 3ds Max scene files with the FBX, renders and textures.",
    PackageKind.ENVIRONMENT: "The model placed in its environment scene.",
    PackageKind.WHOLE: "The complete model in one download.",
    BUNDLE_KIND: "Every package of this model in one download, at 25% off the total.",
}
def is_single_zip(files: Iterable[ProductFile]) -> bool:
    """A single-zip model: the Whole File zip is its only package (it has no variations)."""
    kinds = {row.package_kind for row in files if not row.is_preview and row.package_kind}
    return kinds == {PackageKind.WHOLE}


def sold_package_rows(files: Iterable[ProductFile]) -> list[ProductFile]:
    """The package rows an admin prices and a buyer picks, in PACKAGE_ORDER: the variations, or
    for a single-zip model its one Whole File zip."""
    rows = [row for row in files if not row.is_preview and row.package_kind]
    if is_single_zip(rows):
        return rows
    return sorted(
        (row for row in rows if row.package_kind in SINGLE_KINDS),
        key=lambda row: PACKAGE_ORDER.index(row.package_kind),
    )


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


@dataclass(frozen=True)
class BundleQuote:
    """What the All variations line costs a buyer now, and why it is or is not offered."""

    # The packages the line covers: those the buyer does not own yet.
    kinds: tuple[str, ...]
    # Those packages at their price now.
    subtotal: Decimal
    # What the buyer pays: the subtotal less BUNDLE_DISCOUNT_PERCENT, in whole dollars.
    price: Decimal
    # Why it is not offered, or "" when it is.
    reason: str

    @property
    def eligible(self) -> bool:
        return not self.reason


def bundle_quote(files: Iterable[ProductFile], owned: frozenset[str] = frozenset(), *, now) -> BundleQuote:
    """The All variations price of a model for a buyer who owns the kinds in ``owned``.

    Offered only when the model has the Whole File zip, no single package is on sale, and at
    least two packages are left for the buyer to buy. A model with one package gets no bundle.
    """
    rows = {row.package_kind: row for row in files if not row.is_preview and row.package_kind}
    singles = [rows[kind] for kind in SINGLE_KINDS if kind in rows and rows[kind].price is not None]
    open_rows = [row for row in singles if row.package_kind not in owned]
    subtotal = sum((row.effective_price(now) for row in open_rows), Decimal("0.00"))
    price = (subtotal * (100 - BUNDLE_DISCOUNT_PERCENT) / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    if PackageKind.WHOLE not in rows:
        reason = "This model has no Whole File zip to deliver."
    elif any(row.active_discount_price(now) is not None for row in singles):
        reason = "A package of this model is on sale."
    elif len(open_rows) < 2:
        reason = "Fewer than two packages are left to buy together."
    else:
        reason = ""
    return BundleQuote(
        kinds=tuple(row.package_kind for row in open_rows),
        subtotal=subtotal,
        price=price,
        reason=reason,
    )


def bundle_payload(quote: BundleQuote) -> dict[str, Any]:
    """The All variations offer as the API sends it."""
    return {
        "eligible": quote.eligible,
        "reason": quote.reason,
        "kinds": list(quote.kinds),
        "subtotal": f"{quote.subtotal:.2f}",
        "price": f"{quote.price:.2f}",
    }
