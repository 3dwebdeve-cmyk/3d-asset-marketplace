"""Pricing page service (docs/PRICING_PIPELINE.md).

The admin ticks models and types one rate and one percent per single package (Whole File is
not priced: All variations sells it at a discount of its packages). Every package price is
calculated by the server:

    base price    = hours spent x rate
    package price = round(base price x percent / 100)     (whole dollars, half up)

A model gets a price only for the packages it has. ``calculate`` shows the result and changes
nothing. ``publish`` recalculates, saves each model's package prices and puts the model on the
store, one model at a time: a model that fails stays waiting and its reason is returned.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from datetime import timezone as dt_timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from django.db import transaction
from django.db.models import Q, QuerySet

from config.currency import MINIMUM_CHECKOUT_AMOUNTS
from products.errors import ProductError
from products.models import Product, ProductFile, ProductPriceChange
from products.packages import (
    PACKAGE_LABELS,
    PACKAGE_ORDER,
    SINGLE_KINDS,
    sync_summary_price,
)
from products.price_history import PriceState, record_price_change
from products.services import UPLOAD_KIND_FREE, ProductService

TAB_WAITING = "waiting"
TAB_LIVE = "live"
TABS = frozenset({TAB_WAITING, TAB_LIVE})

MAX_MODELS_PER_ACTION = 200
CURRENCY = "USD"
MINIMUM_PRICE = MINIMUM_CHECKOUT_AMOUNTS[CURRENCY]
CENT = Decimal("0.01")
WHOLE_DOLLAR = Decimal("1")
MAX_RATE = Decimal("100000")
MAX_PERCENT = Decimal("200")
MAX_HOURS = Decimal("99999.99")

LIST_ORDERINGS = frozenset(
    {
        "name",
        "-name",
        "price",
        "-price",
        "polygon_count",
        "-polygon_count",
        "hours_spent",
        "-hours_spent",
        "created_at",
        "-created_at",
    }
)


class PricingConflict(ProductError):
    """The prices changed since the calculation; the page must calculate again (HTTP 409)."""


# ─── Listing ────────────────────────────────────────────────────────────────


def list_models(
    *,
    tab: str,
    category_id: UUID | None = None,
    subcategory_id: UUID | None = None,
    search: str | None = None,
    import_batch_id: str | None = None,
    ordering: str | None = None,
) -> QuerySet[Product]:
    """Models on the Pricing page. Waiting: paid models that passed QA. Live: paid models on
    the store (free models never have a price)."""
    queryset = (
        Product.objects.select_related("category")
        .prefetch_related("files")
        .annotate(free_upload=ProductService.free_upload_exists())
    )
    if tab == TAB_WAITING:
        queryset = queryset.filter(status=Product.Status.AWAITING_PRICE)
    elif tab == TAB_LIVE:
        queryset = queryset.filter(status=Product.Status.PUBLISHED)
    else:
        raise ProductError("Tab must be 'waiting' or 'live'.", field="tab")
    queryset = queryset.filter(free_upload=False)

    if category_id is not None:
        # A main category includes its subcategories.
        queryset = queryset.filter(Q(category_id=category_id) | Q(category__parent_id=category_id))
    if subcategory_id is not None:
        queryset = queryset.filter(category_id=subcategory_id)
    query = (search or "").strip()
    if query:
        queryset = queryset.filter(Q(name__icontains=query) | Q(sku__icontains=query.upper()))
    if import_batch_id and import_batch_id.strip():
        queryset = queryset.filter(import_batch_id=import_batch_id.strip())
    order = ordering if ordering in LIST_ORDERINGS else "name"
    return queryset.order_by(order, "pk")


def list_batches(tab: str) -> list[str]:
    """Upload batch IDs of the models in a tab, newest first (for the batch filter)."""
    queryset = list_models(tab=tab).exclude(import_batch_id="")
    batches: list[str] = []
    for batch in queryset.order_by("-created_at").values_list("import_batch_id", flat=True):
        if batch not in batches:
            batches.append(batch)
        if len(batches) == 50:
            break
    return batches


def _text(value: Decimal | None) -> str | None:
    """Money as a string with two decimals, like the rest of the API ("12.00")."""
    return None if value is None else str(value.quantize(CENT, rounding=ROUND_HALF_UP))


def _time_text(value: datetime | None) -> str | None:
    return None if value is None else value.astimezone(dt_timezone.utc).isoformat()


def package_rows(product: Product) -> list[ProductFile]:
    """A model's priced packages (not Whole File) in PACKAGE_ORDER. Reads ``product.files.all()``
    (prefetched)."""
    return sorted(
        (
            row
            for row in product.files.all()
            if not row.is_preview and row.package_kind in SINGLE_KINDS
        ),
        key=lambda row: PACKAGE_ORDER.index(row.package_kind),
    )


def package_summaries(product: Product, now: datetime) -> list[dict[str, Any]]:
    """Every package of a model with its price and sale (what a buyer pays now)."""
    summaries = []
    for row in package_rows(product):
        price = row.price
        sale = row.active_discount_price(now)
        effective = sale if sale is not None else price
        summaries.append(
            {
                "kind": row.package_kind,
                "label": PACKAGE_LABELS[row.package_kind],
                "price": _text(price),
                "sale_price": _text(sale),
                "sale_ends_at": _time_text(row.discount_ends_at if sale is not None else None),
                "buyer_pays": _text(effective),
            }
        )
    return summaries


# ─── The rate and the percents ──────────────────────────────────────────────


@dataclass(frozen=True)
class PricingInput:
    """The rate per hour and the percent of the base price for every package kind."""

    rate: Decimal
    percents: dict[str, Decimal]

    @classmethod
    def clean(cls, rate: Any, percents: Any) -> PricingInput:
        try:
            clean_rate = Decimal(str(rate)).quantize(CENT, rounding=ROUND_HALF_UP)
        except ArithmeticError:
            raise ProductError("Enter the rate per hour.", field="rate") from None
        if not Decimal("0") < clean_rate <= MAX_RATE:
            raise ProductError(
                f"The rate must be above 0 and at most {MAX_RATE:.0f}.", field="rate"
            )
        if not isinstance(percents, dict) or set(percents) != set(SINGLE_KINDS):
            raise ProductError("Enter a percent for every package.", field="percents")
        clean_percents: dict[str, Decimal] = {}
        for kind in SINGLE_KINDS:
            try:
                value = Decimal(str(percents[kind])).quantize(CENT, rounding=ROUND_HALF_UP)
            except ArithmeticError:
                raise ProductError(
                    f"Enter the {PACKAGE_LABELS[kind]} percent.", field="percents"
                ) from None
            if not Decimal("0") < value <= MAX_PERCENT:
                raise ProductError(
                    f"A percent must be above 0 and at most {MAX_PERCENT:.0f}.", field="percents"
                )
            clean_percents[kind] = value
        return cls(clean_rate, clean_percents)

    def canonical(self) -> dict[str, Any]:
        return {
            "rate": _text(self.rate),
            "percents": {kind: _text(value) for kind, value in self.percents.items()},
        }


# ─── Calculation ────────────────────────────────────────────────────────────


@dataclass
class PricedPackage:
    package: ProductFile
    old_price: Decimal | None
    new_price: Decimal | None


@dataclass
class PricingRow:
    product: Product
    packages: list[PricedPackage] = field(default_factory=list)
    error: str = ""

    def fingerprint(self) -> list[Any]:
        return [
            str(self.product.pk),
            self.product.status,
            _text(self.product.hours_spent),
            [[str(item.package.pk), _text(item.old_price), _text(item.new_price)] for item in self.packages],
            self.error,
        ]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.product.pk),
            "name": self.product.name,
            "sku": self.product.sku,
            "hours_spent": _text(self.product.hours_spent),
            "error": self.error,
            "packages": [
                {
                    "kind": item.package.package_kind,
                    "label": PACKAGE_LABELS[item.package.package_kind],
                    "old_price": _text(item.old_price),
                    "price": _text(item.new_price),
                }
                for item in self.packages
            ],
        }


def calculate_row(product: Product, pricing_input: PricingInput) -> PricingRow:
    """One model's package prices, or the reason it cannot be priced."""
    row = PricingRow(product=product)
    if product.status != Product.Status.AWAITING_PRICE:
        row.error = "Only models waiting for a price can be priced here."
        return row
    if product.currency != CURRENCY:
        row.error = f"Only {CURRENCY} prices are supported."
        return row
    if ProductService.upload_kind(product) == UPLOAD_KIND_FREE:
        row.error = "Free models have no price."
        return row
    hours = product.hours_spent
    if hours is None or hours <= 0:
        row.error = "Enter the hours spent first."
        return row
    packages = package_rows(product)
    if not packages:
        row.error = "This model has no packages."
        return row
    base = hours * pricing_input.rate
    for package in packages:
        percent = pricing_input.percents[package.package_kind]
        price = (base * percent / Decimal("100")).quantize(WHOLE_DOLLAR, rounding=ROUND_HALF_UP)
        if price < MINIMUM_PRICE:
            row.error = (
                f"{PACKAGE_LABELS[package.package_kind]} would cost {price:.2f}; "
                f"the lowest allowed is {MINIMUM_PRICE}."
            )
            row.packages = []
            return row
        row.packages.append(PricedPackage(package, package.price, price))
    return row


@dataclass
class PricingPlan:
    rows: list[PricingRow]
    pricing_input: PricingInput

    @property
    def token(self) -> str:
        payload = {
            "input": self.pricing_input.canonical(),
            "rows": [row.fingerprint() for row in self.rows],
        }
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        ok = [row for row in self.rows if not row.error]
        return {
            "rows": [row.to_dict() for row in self.rows],
            "summary": {
                "models": len(self.rows),
                "priced": len(ok),
                "errors": len(self.rows) - len(ok),
                "currency": CURRENCY,
            },
            "preview_token": self.token,
        }


def _check_ids(product_ids: list[UUID]) -> list[UUID]:
    ids = list(dict.fromkeys(product_ids))
    if not ids:
        raise ProductError("Select at least one model.", field="product_ids")
    if len(ids) > MAX_MODELS_PER_ACTION:
        raise ProductError(
            f"Select at most {MAX_MODELS_PER_ACTION} models at a time.", field="product_ids"
        )
    return ids


def _load(ids: list[UUID]) -> list[Product]:
    products = list(Product.objects.filter(pk__in=ids).prefetch_related("files").order_by("pk"))
    if len(products) != len(ids):
        raise ProductError("Some selected models no longer exist. Reload the page.", field="product_ids")
    return products


def calculate(product_ids: list[UUID], pricing_input: PricingInput) -> PricingPlan:
    """The prices the selection would get. Changes nothing."""
    products = _load(_check_ids(product_ids))
    return PricingPlan([calculate_row(product, pricing_input) for product in products], pricing_input)


# ─── Hours ──────────────────────────────────────────────────────────────────


@transaction.atomic
def save_hours(items: list[dict[str, Any]]) -> int:
    """Set (or clear, with None) each model's hours spent. Returns how many models changed."""
    ids = _check_ids([item["id"] for item in items])
    products = {
        product.pk: product
        for product in Product.objects.filter(pk__in=ids).order_by("pk").select_for_update()
    }
    if len(products) != len(ids):
        raise ProductError("Some selected models no longer exist. Reload the page.", field="product_ids")
    changed = 0
    for item in items:
        product = products[item["id"]]
        hours = item["hours_spent"]
        if hours is not None and not Decimal("0") < hours <= MAX_HOURS:
            raise ProductError("Hours must be above 0.", field="hours_spent")
        if product.hours_spent != hours:
            product.hours_spent = hours
            product.save(update_fields=["hours_spent", "updated_at"])
            changed += 1
    return changed


# ─── Publish ────────────────────────────────────────────────────────────────


class _NotPublished(Exception):
    """Raised inside a model's transaction to undo its price writes."""


def publish(
    product_ids: list[UUID],
    pricing_input: PricingInput,
    *,
    preview_token: str,
    confirm_count: int | None,
    actor,
) -> dict[str, Any]:
    """Save the calculated package prices and put the models on the store.

    The calculation is repeated and refused with a conflict if it differs from what the admin
    saw (``preview_token``). Each model is then saved and published on its own: one that fails
    keeps its old prices, stays waiting, and its reason is returned.
    """
    ids = _check_ids(product_ids)
    if confirm_count != len(ids):
        raise ProductError(
            f"Confirm the publish: send the number of selected models ({len(ids)}).",
            field="confirm_count",
        )
    if calculate(ids, pricing_input).token != preview_token:
        raise PricingConflict(
            "Prices or hours changed since the calculation. Calculate again before publishing.",
            field="preview_token",
        )
    batch_id = f"pricing-{uuid.uuid4().hex[:16]}"
    results = [
        _publish_one(product_id, pricing_input, batch_id=batch_id, actor=actor)
        for product_id in sorted(ids)
    ]
    published = [row for row in results if row["published"]]
    return {
        "batch_id": batch_id,
        "models": len(ids),
        "published": len(published),
        "failed": len(ids) - len(published),
        "results": results,
    }


def _publish_one(
    product_id: UUID, pricing_input: PricingInput, *, batch_id: str, actor
) -> dict[str, Any]:
    reason = ""
    product: Product | None = None
    try:
        with transaction.atomic():
            product = (
                Product.objects.select_for_update(of=("self",))
                .prefetch_related("files")
                .filter(pk=product_id)
                .first()
            )
            if product is None:
                return _result(product_id, None, "This model no longer exists.")
            row = calculate_row(product, pricing_input)
            if row.error:
                raise _NotPublished(row.error)
            for item in row.packages:
                package = item.package
                before = PriceState.of(package)
                package.price = item.new_price
                # A fresh price replaces any sale: a sale price could be above the new price.
                package.discount_price = None
                package.discount_ends_at = None
                package.save(update_fields=["price", "discount_price", "discount_ends_at", "updated_at"])
                record_price_change(
                    package,
                    before,
                    source=ProductPriceChange.Source.PRICING_PAGE,
                    actor=actor,
                    batch_id=batch_id,
                )
            sync_summary_price(product)
            publish_error = _publish_error(product)
            if publish_error:
                raise _NotPublished(publish_error)
            product.status = Product.Status.PUBLISHED
            product.pending_update = False
            product.save(update_fields=["status", "pending_update", "updated_at"])
    except _NotPublished as exc:
        reason = str(exc)
    return _result(product_id, product, reason)


def _publish_error(product: Product) -> str:
    # Every package's price and running sale are checked by _validate_publish_ready.
    try:
        ProductService._validate_publish_ready(product, require_sku=True)
    except ProductError as exc:
        details = [f"{key}: {' '.join(values)}" for key, values in (exc.errors or {}).items()]
        return "; ".join(details) or exc.message
    return ""


def _result(product_id: UUID, product: Product | None, reason: str) -> dict[str, Any]:
    return {
        "id": str(product_id),
        "name": product.name if product else "",
        "sku": product.sku if product else None,
        "published": not reason,
        "reason": reason,
    }
