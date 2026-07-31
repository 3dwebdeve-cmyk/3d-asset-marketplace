from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import stripe
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

from cart.services import CartService
from coupons.services import CouponService
from orders.entitlements import order_allows_download
from orders.models import Order
from orders.services import OrderError, OrderService

from payments.models import Payment, StripeWebhookEvent

User = get_user_model()

stripe.api_key = settings.STRIPE_SECRET_KEY


class CheckoutError(Exception):
    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


def _to_cents(amount: Decimal) -> int:
    return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _session_value(session: Any, key: str) -> Any:
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


def _stripe_id(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        raw = value.get("id")
        return str(raw) if raw else ""
    raw = getattr(value, "id", None)
    return str(raw) if raw else ""


class CheckoutService:
    @classmethod
    def create_checkout_session(cls, user: User) -> dict[str, str]:
        if not settings.STRIPE_SECRET_KEY:
            raise CheckoutError("Payments are not configured. Please try again later.")

        try:
            order, discount_amount, coupon = OrderService.create_from_cart(user)
        except OrderError as exc:
            raise CheckoutError(exc.message, field=exc.field) from exc

        titles = OrderService.build_catalog_titles(list(order.items.all()))
        currency_lower = order.currency.lower()

        line_items: list[dict[str, Any]] = []
        for item in order.items.all():
            title = titles.get((item.product_type, item.product_id)) or "Marketplace item"
            line_items.append(
                {
                    "price_data": {
                        "currency": currency_lower,
                        "product_data": {"name": title},
                        "unit_amount": _to_cents(item.purchase_price),
                    },
                    "quantity": item.quantity,
                }
            )

        discounts: list[dict[str, str]] = []
        if discount_amount > Decimal("0.00"):
            stripe_coupon = stripe.Coupon.create(
                amount_off=_to_cents(discount_amount),
                currency=currency_lower,
                duration="once",
                name=f"Order {order.invoice_number} discount",
            )
            discounts.append({"coupon": stripe_coupon.id})

        frontend_base_url = settings.FRONTEND_BASE_URL.rstrip("/")

        try:
            session = stripe.checkout.Session.create(
                mode="payment",
                line_items=line_items,
                discounts=discounts or None,
                customer_email=user.email,
                client_reference_id=str(user.id),
                success_url=f"{frontend_base_url}/checkout/success?order_id={order.id}",
                cancel_url=f"{frontend_base_url}/checkout/cancel?order_id={order.id}",
                metadata={"order_id": str(order.id)},
            )
        except stripe.error.StripeError as exc:
            raise CheckoutError(
                "Unable to start checkout. Please try again.",
            ) from exc

        Payment.objects.create(
            order=order,
            coupon=coupon,
            stripe_checkout_session_id=session.id,
            amount=order.total_amount,
            currency=order.currency,
            status=Payment.Status.PENDING,
        )

        return {"checkout_url": session.url, "order_id": str(order.id)}


class WebhookService:
    @classmethod
    def handle_event(cls, event: "stripe.Event") -> None:
        # Keep idempotency insert + processing in one transaction so a handler
        # crash rolls back the event row and Stripe retries can succeed.
        with transaction.atomic():
            try:
                StripeWebhookEvent.objects.create(
                    stripe_event_id=event.id,
                    event_type=event.type,
                )
            except IntegrityError:
                return

            if event.type == "checkout.session.completed":
                cls._handle_checkout_completed(event.data.object)
            elif event.type == "checkout.session.expired":
                cls._handle_checkout_expired(event.data.object)
            elif event.type == "payment_intent.payment_failed":
                cls._handle_payment_failed(event.data.object)

    @classmethod
    def _handle_checkout_completed(cls, session: "stripe.checkout.Session") -> None:
        # Note: coupon is a nullable FK, so it is intentionally excluded from
        # select_related here — Postgres rejects SELECT ... FOR UPDATE across
        # a LEFT OUTER JOIN ("nullable side"). payment.coupon is instead
        # lazy-loaded (unlocked) just below when needed.
        session_id = _stripe_id(session) or str(_session_value(session, "id") or "")
        try:
            payment = Payment.objects.select_for_update().select_related("order").get(
                stripe_checkout_session_id=session_id
            )
        except Payment.DoesNotExist:
            return

        if payment.status == Payment.Status.SUCCEEDED:
            return

        payment_intent = _stripe_id(_session_value(session, "payment_intent"))
        payment.status = Payment.Status.SUCCEEDED
        payment.stripe_payment_intent_id = payment_intent
        payment.save(update_fields=["status", "stripe_payment_intent_id", "updated_at"])

        order = payment.order
        if not order_allows_download(order):
            if order.order_status == Order.OrderStatus.PENDING:
                order = OrderService.update_order_status(order, Order.OrderStatus.PAID)
            if order.payment_status == Order.PaymentStatus.PENDING:
                OrderService.update_payment_status(order, Order.PaymentStatus.PAID)

        purchased_keys = {
            (item.product_type, item.product_id) for item in order.items.all()
        }
        CartService.remove_items(order.user, purchased_keys)

        if payment.coupon_id is not None:
            CouponService.increment_usage(payment.coupon)

    @classmethod
    def _handle_checkout_expired(cls, session: "stripe.checkout.Session") -> None:
        session_id = _stripe_id(session) or str(_session_value(session, "id") or "")
        Payment.objects.filter(
            stripe_checkout_session_id=session_id,
            status=Payment.Status.PENDING,
        ).update(status=Payment.Status.EXPIRED)

    @classmethod
    def _handle_payment_failed(cls, payment_intent: "stripe.PaymentIntent") -> None:
        intent_id = _stripe_id(payment_intent)
        Payment.objects.filter(
            stripe_payment_intent_id=intent_id,
            status=Payment.Status.PENDING,
        ).update(status=Payment.Status.FAILED)
