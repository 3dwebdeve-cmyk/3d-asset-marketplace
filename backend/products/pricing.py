"""Pricing page service (docs/PRICING_PIPELINE.md, Part 2).

The server calculates every price. The page sends model IDs and a rule (one price, a price per
poly level, % off, $ off, or remove the sale); ``preview`` returns the calculated rows and a
token; ``apply`` recalculates under row locks, refuses when anything changed since the preview
(the token differs), and saves everything or nothing with one price-history batch. ``publish``
puts priced models from "Waiting for price" on the store, one by one, with the publish checks.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from datetime import timezone as dt_timezone
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone

from config.currency import MINIMUM_CHECKOUT_AMOUNTS
from products.errors import ProductError
from products.models import Product, ProductPriceChange
from products.price_history import PriceState, record_price_change
from products.services import UPLOAD_KIND_FREE, ProductService

TAB_WAITING = "waiting"
TAB_LIVE = "live"
TABS = frozenset({TAB_WAITING, TAB_LIVE})

TIER_LOW = "low"
TIER_MID = "mid"
TIER_HIGH = "high"
TIER_UNKNOWN = "unknown"
TIERS = (TIER_LOW, TIER_MID, TIER_HIGH, TIER_UNKNOWN)
DEFAULT_LOW_BELOW = 10_000
DEFAULT_HIGH_ABOVE = 100_000

RULE_SET_PRICE = "set_price"
RULE_TIER_PRICE = "tier_price"
RULE_PERCENT_OFF = "percent_off"
RULE_AMOUNT_OFF = "amount_off"
RULE_REMOVE_SALE = "remove_sale"
RULES = frozenset(
    {RULE_SET_PRICE, RULE_TIER_PRICE, RULE_PERCENT_OFF, RULE_AMOUNT_OFF, RULE_REMOVE_SALE}
)
SALE_RULES = frozenset({RULE_PERCENT_OFF, RULE_AMOUNT_OFF})

MAX_MODELS_PER_ACTION = 200
MAX_DISCOUNT_SHARE = Decimal("0.90")
CONFIRM_DISCOUNT_SHARE = Decimal("0.50")
CURRENCY = "USD"
MINIMUM_PRICE = MINIMUM_CHECKOUT_AMOUNTS[CURRENCY]
CENT = Decimal("0.01")

LIST_ORDERINGS = frozenset(
    {
        "name",
        "-name",
        "price",
        "-price",
        "polygon_count",
        "-polygon_count",
        "created_at",
        "-created_at",
    }
)


class PricingConflict(ProductError):
    """The prices changed since the preview; the page must preview again (HTTP 409)."""


# ─── Poly levels ────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class PolyThresholds:
    """Low: fewer than ``low_below`` polygons. High: more than ``high_above``. Mid: between,
    both ends included. No polygon count: unknown."""

    low_below: int = DEFAULT_LOW_BELOW
    high_above: int = DEFAULT_HIGH_ABOVE

    def __post_init__(self) -> None:
        if self.low_below < 1 or self.high_above < self.low_below:
            raise ProductError(
                "The Low limit must be at least 1 and not above the High limit.",
                field="low_below",
            )

    def tier(self, polygon_count: int | None) -> str:
        if polygon_count is None:
            return TIER_UNKNOWN
        if polygon_count < self.low_below:
            return TIER_LOW
        if polygon_count > self.high_above:
            return TIER_HIGH
        return TIER_MID

    def tier_q(self, tier: str) -> Q:
        if tier == TIER_UNKNOWN:
            return Q(polygon_count__isnull=True)
        if tier == TIER_LOW:
            return Q(polygon_count__lt=self.low_below)
        if tier == TIER_HIGH:
            return Q(polygon_count__gt=self.high_above)
        if tier == TIER_MID:
            return Q(polygon_count__gte=self.low_below, polygon_count__lte=self.high_above)
        raise ProductError("Poly level must be low, mid, high or unknown.", field="poly")


# ─── Listing ────────────────────────────────────────────────────────────────


def list_models(
    *,
    tab: str,
    thresholds: PolyThresholds,
    category_id: UUID | None = None,
    subcategory_id: UUID | None = None,
    poly: str | None = None,
    search: str | None = None,
    import_batch_id: str | None = None,
    ordering: str | None = None,
) -> QuerySet[Product]:
    """Models on the Pricing page. Waiting: paid models that passed QA. Live: paid models on
    the store (free models never have a price or a sale)."""
    queryset = Product.objects.select_related("category").annotate(
        free_upload=ProductService.free_upload_exists()
    )
    if tab == TAB_WAITING:
        queryset = queryset.filter(status=Product.Status.AWAITING_PRICE)
    elif tab == TAB_LIVE:
        queryset = queryset.filter(status=Product.Status.PUBLISHED, price__gt=0)
    else:
        raise ProductError("Tab must be 'waiting' or 'live'.", field="tab")
    queryset = queryset.filter(free_upload=False)

    if category_id is not None:
        # A main category includes its subcategories.
        queryset = queryset.filter(Q(category_id=category_id) | Q(category__parent_id=category_id))
    if subcategory_id is not None:
        queryset = queryset.filter(category_id=subcategory_id)
    if poly:
        queryset = queryset.filter(thresholds.tier_q(poly))
    query = (search or "").strip()
    if query:
        queryset = queryset.filter(Q(name__icontains=query) | Q(sku__icontains=query.upper()))
    if import_batch_id and import_batch_id.strip():
        queryset = queryset.filter(import_batch_id=import_batch_id.strip())
    order = ordering if ordering in LIST_ORDERINGS else "name"
    return queryset.order_by(order, "pk")


def list_batches(tab: str) -> list[str]:
    """Upload batch IDs of the models in a tab, newest first (for the batch filter)."""
    queryset = list_models(tab=tab, thresholds=PolyThresholds()).exclude(import_batch_id="")
    batches: list[str] = []
    for batch in queryset.order_by("-created_at").values_list("import_batch_id", flat=True):
        if batch not in batches:
            batches.append(batch)
        if len(batches) == 50:
            break
    return batches


# ─── Rules and calculation ──────────────────────────────────────────────────


@dataclass(frozen=True)
class PricingRule:
    kind: str
    thresholds: PolyThresholds = field(default_factory=PolyThresholds)
    price: Decimal | None = None
    tier_prices: dict[str, Decimal] = field(default_factory=dict)
    percent: Decimal | None = None
    amount: Decimal | None = None
    round_99: bool = False
    discount_ends_at: datetime | None = None

    def canonical(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "low_below": self.thresholds.low_below,
            "high_above": self.thresholds.high_above,
            "price": _text(self.price),
            "tier_prices": {tier: _text(value) for tier, value in sorted(self.tier_prices.items())},
            "percent": _text(self.percent),
            "amount": _text(self.amount),
            "round_99": self.round_99,
            "discount_ends_at": _time_text(self.discount_ends_at),
        }


@dataclass
class PricingRow:
    product: Product
    tier: str
    old_price: Decimal
    old_sale: Decimal | None
    old_ends_at: datetime | None
    new_price: Decimal
    new_sale: Decimal | None
    new_ends_at: datetime | None
    error: str = ""

    @property
    def old_effective(self) -> Decimal:
        return self.old_sale if self.old_sale is not None else self.old_price

    @property
    def new_effective(self) -> Decimal:
        return self.new_sale if self.new_sale is not None else self.new_price

    @property
    def discount_share(self) -> Decimal:
        if self.new_sale is None or self.new_price <= 0:
            return Decimal("0")
        return (self.new_price - self.new_sale) / self.new_price

    @property
    def changed(self) -> bool:
        product = self.product
        return (
            self.new_price != product.price
            or self.new_sale != product.discount_price
            or self.new_ends_at != product.discount_ends_at
        )

    def fingerprint(self) -> list[Any]:
        product = self.product
        return [
            str(product.pk),
            product.status,
            _text(product.price),
            _text(product.discount_price),
            _time_text(product.discount_ends_at),
            _text(self.new_price),
            _text(self.new_sale),
            _time_text(self.new_ends_at),
            self.error,
        ]

    def to_dict(self) -> dict[str, Any]:
        product = self.product
        saving = self.new_price - self.new_sale if self.new_sale is not None else Decimal("0")
        return {
            "id": str(product.pk),
            "name": product.name,
            "sku": product.sku,
            "status": product.status,
            "polygon_count": product.polygon_count,
            "poly_tier": self.tier,
            "currency": product.currency,
            "old_price": _text(self.old_price),
            "old_sale_price": _text(self.old_sale),
            "old_sale_ends_at": _time_text(self.old_ends_at),
            "new_price": _text(self.new_price),
            "new_sale_price": _text(self.new_sale),
            "new_sale_ends_at": _time_text(self.new_ends_at),
            "amount_off": _text(saving),
            "percent_off": str((self.discount_share * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)),
            "buyer_pays": _text(self.new_effective),
            "changed": self.changed and not self.error,
            "error": self.error,
        }


def _text(value: Decimal | None) -> str | None:
    """Money as a string with two decimals, like the rest of the API ("12.00")."""
    return None if value is None else str(value.quantize(CENT, rounding=ROUND_HALF_UP))


def _time_text(value: datetime | None) -> str | None:
    return None if value is None else value.astimezone(dt_timezone.utc).isoformat()


def ending_99(value: Decimal) -> Decimal:
    """The highest price ending in .99 that is not above ``value``: 8.40 -> 7.99, 9.00 -> 8.99,
    8.99 -> 8.99."""
    return (value + CENT).to_integral_value(rounding=ROUND_FLOOR) - CENT


def calculate(products: list[Product], rule: PricingRule, now: datetime) -> list[PricingRow]:
    return [_calculate_row(product, rule, now) for product in products]


def _calculate_row(product: Product, rule: PricingRule, now: datetime) -> PricingRow:
    tier = rule.thresholds.tier(product.polygon_count)
    active_sale = product.active_discount_price(now)
    # An ended sale that is still stored counts as no sale (it is cleared on save).
    sale = active_sale
    ends_at = product.discount_ends_at if active_sale is not None else None
    row = PricingRow(
        product=product,
        tier=tier,
        old_price=product.price,
        old_sale=active_sale,
        old_ends_at=ends_at,
        new_price=product.price,
        new_sale=sale,
        new_ends_at=ends_at,
    )

    eligible = _eligibility_error(product)
    if eligible:
        row.error = eligible
        return row

    if rule.kind in (RULE_SET_PRICE, RULE_TIER_PRICE):
        price = rule.price if rule.kind == RULE_SET_PRICE else rule.tier_prices.get(tier)
        if price is None:
            row.error = f"No price was given for {tier} poly models."
            return row
        row.new_price = price
        if row.new_sale is not None and row.new_sale >= price:
            row.error = (
                f"The running sale price {row.new_sale:.2f} would not be lower than the new "
                "price. Remove the sale first, or choose a higher price."
            )
            return row
    elif rule.kind in SALE_RULES:
        base = product.price
        if base < MINIMUM_PRICE:
            row.error = "Set the price before giving a sale."
            return row
        if rule.kind == RULE_PERCENT_OFF:
            sale = (base * (Decimal("100") - rule.percent) / Decimal("100")).quantize(
                CENT, rounding=ROUND_HALF_UP
            )
        else:
            sale = (base - rule.amount).quantize(CENT, rounding=ROUND_HALF_UP)
        if rule.round_99:
            sale = ending_99(sale)
        row.new_sale = sale
        row.new_ends_at = rule.discount_ends_at
    elif rule.kind == RULE_REMOVE_SALE:
        row.new_sale = None
        row.new_ends_at = None
    else:  # validated by the serializer; kept as a guard
        row.error = "Unknown pricing rule."
        return row

    row.error = _price_error(row)
    return row


def _eligibility_error(product: Product) -> str:
    if product.status == Product.Status.AWAITING_PRICE:
        pass
    elif product.status == Product.Status.PUBLISHED:
        if product.price <= 0:
            return "Free models have no price or sale."
    else:
        return "Only models waiting for a price or on the store can be priced here."
    if product.currency != CURRENCY:
        return f"Only {CURRENCY} prices are supported."
    if ProductService.upload_kind(product) == UPLOAD_KIND_FREE:
        return "Free models have no price or sale."
    return ""


def _price_error(row: PricingRow) -> str:
    if row.new_price < MINIMUM_PRICE:
        return f"The price must be at least {MINIMUM_PRICE} {CURRENCY}."
    if row.new_sale is None:
        return ""
    if row.new_sale < MINIMUM_PRICE:
        return f"The sale price would be {row.new_sale:.2f}; the lowest allowed is {MINIMUM_PRICE}."
    if row.new_sale >= row.new_price:
        return "The sale price must be lower than the price."
    if row.discount_share > MAX_DISCOUNT_SHARE:
        return "A sale may take at most 90% off."
    return ""


# ─── Preview, apply, publish ────────────────────────────────────────────────


@dataclass
class PricingPreview:
    rows: list[PricingRow]
    rule: PricingRule

    @property
    def token(self) -> str:
        payload = {"rule": self.rule.canonical(), "rows": [row.fingerprint() for row in self.rows]}
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()

    @property
    def needs_confirmation(self) -> bool:
        return any(not row.error and row.discount_share > CONFIRM_DISCOUNT_SHARE for row in self.rows)

    def to_dict(self) -> dict[str, Any]:
        ok_rows = [row for row in self.rows if not row.error]
        return {
            "rows": [row.to_dict() for row in self.rows],
            "summary": {
                "models": len(self.rows),
                "changed": sum(1 for row in ok_rows if row.changed),
                "errors": len(self.rows) - len(ok_rows),
                "currency": CURRENCY,
                "buyer_pays_before": _text(sum((row.old_effective for row in ok_rows), Decimal("0"))),
                "buyer_pays_after": _text(sum((row.new_effective for row in ok_rows), Decimal("0"))),
                "needs_confirmation": self.needs_confirmation,
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


def _load(ids: list[UUID], *, lock: bool) -> list[Product]:
    queryset = Product.objects.filter(pk__in=ids).prefetch_related("files").order_by("pk")
    if lock:
        # Ordered by primary key, so two saves on overlapping selections cannot deadlock.
        queryset = queryset.select_for_update(of=("self",))
    products = list(queryset)
    if len(products) != len(ids):
        raise ProductError("Some selected models no longer exist. Reload the page.", field="product_ids")
    return products


def preview(product_ids: list[UUID], rule: PricingRule) -> PricingPreview:
    ids = _check_ids(product_ids)
    return PricingPreview(calculate(_load(ids, lock=False), rule, timezone.now()), rule)


@transaction.atomic
def apply(
    product_ids: list[UUID],
    rule: PricingRule,
    *,
    preview_token: str,
    confirm_count: int | None,
    actor,
) -> dict[str, Any]:
    """Save the previewed prices: all or nothing, one history batch, rows locked."""
    ids = _check_ids(product_ids)
    result = PricingPreview(calculate(_load(ids, lock=True), rule, timezone.now()), rule)
    if result.token != preview_token:
        raise PricingConflict(
            "Prices changed since the preview (or a sale ended). Preview again before saving.",
            field="preview_token",
        )
    errors = {str(row.product.pk): [row.error] for row in result.rows if row.error}
    if errors:
        raise ProductError(
            "Some models cannot take this price. Remove them from the selection or change the rule.",
            field="product_ids",
            errors=errors,
        )
    if result.needs_confirmation and confirm_count != len(ids):
        raise ProductError(
            f"A sale above 50% off needs confirmation: type the number of models ({len(ids)}).",
            field="confirm_count",
        )

    batch_id = f"pricing-{uuid.uuid4().hex[:16]}"
    changed = 0
    for row in result.rows:
        if not row.changed:
            continue
        product = row.product
        before = PriceState.of(product)
        product.price = row.new_price
        product.discount_price = row.new_sale
        product.discount_ends_at = row.new_ends_at
        product.save(update_fields=["price", "discount_price", "discount_ends_at", "updated_at"])
        record_price_change(
            product,
            before,
            source=ProductPriceChange.Source.PRICING_PAGE,
            actor=actor,
            batch_id=batch_id,
        )
        changed += 1
    return {
        "batch_id": batch_id,
        "models": len(ids),
        "changed": changed,
        "unchanged": len(ids) - changed,
    }


def publish(product_ids: list[UUID], *, confirm_count: int | None, actor) -> dict[str, Any]:
    """Put priced models from Waiting for price on the store. Each model is checked and saved
    on its own: one that fails stays waiting and its reason is returned."""
    ids = _check_ids(product_ids)
    if confirm_count != len(ids):
        raise ProductError(
            f"Confirm the publish: send the number of selected models ({len(ids)}).",
            field="confirm_count",
        )
    results: list[dict[str, Any]] = []
    for product_id in sorted(ids):
        results.append(_publish_one(product_id, actor=actor))
    published = [row for row in results if row["published"]]
    return {
        "models": len(ids),
        "published": len(published),
        "failed": len(ids) - len(published),
        "results": results,
    }


def _publish_one(product_id: UUID, *, actor) -> dict[str, Any]:
    with transaction.atomic():
        product = (
            Product.objects.select_for_update(of=("self",))
            .prefetch_related("files")
            .filter(pk=product_id)
            .first()
        )
        if product is None:
            return _publish_result(product_id, None, "This model no longer exists.")
        reason = _publish_error(product)
        if reason:
            return _publish_result(product_id, product, reason)
        product.status = Product.Status.PUBLISHED
        product.pending_update = False
        product.save(update_fields=["status", "pending_update", "updated_at"])
    return _publish_result(product_id, product, "")


def _publish_error(product: Product) -> str:
    if product.status != Product.Status.AWAITING_PRICE:
        return "This model is not waiting for a price."
    if ProductService.upload_kind(product) == UPLOAD_KIND_FREE:
        return "Free models are published from QA."
    if product.price < MINIMUM_PRICE:
        return f"Set a price of at least {MINIMUM_PRICE} {CURRENCY} first."
    # A running sale must follow the same rules as one saved on this page (older data, or a
    # sale from before the rules existed, must not reach the store).
    sale = product.active_discount_price()
    if sale is not None:
        share = (product.price - sale) / product.price
        if sale < MINIMUM_PRICE or sale >= product.price or share > MAX_DISCOUNT_SHARE:
            return (
                f"Its sale price {sale:.2f} is not allowed (at least {MINIMUM_PRICE}, below the "
                "price, at most 90% off). Remove the sale or change it first."
            )
    try:
        ProductService._validate_publish_ready(product, require_sku=True)
    except ProductError as exc:
        details = [f"{key}: {' '.join(values)}" for key, values in (exc.errors or {}).items()]
        return "; ".join(details) or exc.message
    return ""


def _publish_result(product_id: UUID, product: Product | None, reason: str) -> dict[str, Any]:
    return {
        "id": str(product_id),
        "name": product.name if product else "",
        "sku": product.sku if product else None,
        "published": not reason,
        "reason": reason,
    }
