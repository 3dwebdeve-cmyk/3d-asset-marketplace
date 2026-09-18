"""Shared payment helpers, errors, and Stripe client setup."""

from __future__ import annotations

from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import stripe
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from orders.models import Order
from payments.models import Payment

stripe.api_key = settings.STRIPE_SECRET_KEY

E2E_CHECKOUT_SESSION_PREFIX = "cs_test_e2e_"

TERMINAL_ORDER_STATUSES = {
    Order.OrderStatus.CANCELLED,
    Order.OrderStatus.REFUNDED,
}
TERMINAL_PAYMENT_STATUSES = {
    Order.PaymentStatus.CANCELLED,
    Order.PaymentStatus.REFUNDED,
}
STALE_LOCAL_PAYMENT_STATUSES = {
    Payment.Status.EXPIRED,
    Payment.Status.FAILED,
}

PAYMENT_STATUS_FILTER_ALIASES = {
    "paid": Payment.Status.SUCCEEDED,
    "cancelled": Payment.Status.EXPIRED,
    "canceled": Payment.Status.EXPIRED,
}

ALLOWED_PAYMENT_STATUS_FILTERS = set(Payment.Status.values) | set(
    PAYMENT_STATUS_FILTER_ALIASES.keys()
)

PAYMENT_ORDERING_FIELDS = {
    "created_at",
    "-created_at",
    "amount",
    "-amount",
    "status",
    "-status",
    "updated_at",
    "-updated_at",
}


class CheckoutError(Exception):
    def __init__(
        self,
        message: str,
        field: str | None = None,
        *,
        code: str | None = None,
        extra: dict | None = None,
    ) -> None:
        self.message = message
        self.field = field
        self.code = code
        self.extra = extra or {}
        super().__init__(message)


class AdminPaymentError(Exception):
    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


def e2e_stripe_simulate_enabled() -> bool:
    return bool(getattr(settings, "E2E_STRIPE_SIMULATE", False))


def to_cents(amount: Decimal) -> int:
    return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def session_value(session: Any, key: str) -> Any:
    """Read a field from a Stripe session or plain dict.

    stripe.StripeObject supports item/attribute access but does not implement
    ``.get()`` — calling ``session.get(...)`` raises AttributeError.
    """
    if isinstance(session, dict):
        return session.get(key)
    try:
        return session[key]
    except (KeyError, TypeError):
        return getattr(session, key, None)


def stripe_id(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        raw = value.get("id")
        return str(raw) if raw else ""
    raw = getattr(value, "id", None)
    return str(raw) if raw else ""


def normalize_status_filter(value: str) -> str:
    normalized = value.strip().lower()
    return PAYMENT_STATUS_FILTER_ALIASES.get(normalized, normalized)


def parse_day_bound(
    value: str | None,
    *,
    end_of_day: bool,
) -> datetime | date | None:
    if not value:
        return None
    raw = value.strip()
    field = "created_before" if end_of_day else "created_after"
    parsed_dt = parse_datetime(raw)
    if parsed_dt is not None:
        if timezone.is_naive(parsed_dt):
            return timezone.make_aware(parsed_dt, timezone.get_current_timezone())
        return parsed_dt
    parsed_day = parse_date(raw)
    if parsed_day is None:
        raise AdminPaymentError("Invalid date filter.", field=field)
    return parsed_day
