"""Stripe Checkout session create/confirm for cart checkout."""

from __future__ import annotations

import logging
import uuid
from typing import Any
from uuid import UUID

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction

from orders.models import Order
from orders.services import OrderError, OrderService
from payments.models import Payment
from payments.payment_common import (
    E2E_CHECKOUT_SESSION_PREFIX,
    STALE_LOCAL_PAYMENT_STATUSES,
    TERMINAL_ORDER_STATUSES,
    TERMINAL_PAYMENT_STATUSES,
    CheckoutError,
    e2e_stripe_simulate_enabled,
    session_value,
    stripe,
    to_cents,
)

User = get_user_model()
logger = logging.getLogger(__name__)


class CheckoutService:
    @classmethod
    def _require_legal_acceptance(cls, user: User, *, accepted_legal=None) -> None:
        from accounts.legal_service import LegalAcceptanceError, LegalAcceptanceService

        try:
            LegalAcceptanceService.ensure_current(user, offered=accepted_legal)
        except LegalAcceptanceError as exc:
            raise CheckoutError(
                exc.message,
                field=exc.field,
                code=exc.code,
                extra={"required_versions": exc.missing},
            ) from exc

    @classmethod
    def create_checkout_session(
        cls,
        user: User,
        *,
        accepted_legal=None,
    ) -> dict[str, str]:
        cls._require_legal_acceptance(user, accepted_legal=accepted_legal)

        simulate = e2e_stripe_simulate_enabled()
        if not settings.STRIPE_SECRET_KEY and not simulate:
            raise CheckoutError("Payments are not configured. Please try again later.")

        try:
            order = OrderService.create_from_cart(user)
        except OrderError as exc:
            raise CheckoutError(exc.message, field=exc.field) from exc

        frontend_base_url = settings.FRONTEND_BASE_URL.rstrip("/")
        success_url = f"{frontend_base_url}/checkout/success?order_id={order.id}"
        cancel_url = f"{frontend_base_url}/checkout/cancel?order_id={order.id}"

        if simulate:
            session_id = f"{E2E_CHECKOUT_SESSION_PREFIX}{uuid.uuid4().hex}"
            Payment.objects.create(
                order=order,
                stripe_checkout_session_id=session_id,
                amount=order.total_amount,
                currency=order.currency,
                status=Payment.Status.PENDING,
            )
            logger.info(
                "e2e_stripe_simulate checkout created order_id=%s",
                order.id,
            )
            return {"checkout_url": success_url, "order_id": str(order.id)}

        fallback_titles = OrderService.build_catalog_titles(list(order.items.all()))
        currency_lower = order.currency.lower()

        line_items: list[dict[str, Any]] = []
        for item in order.items.all():
            title = (
                item.title
                or fallback_titles.get((item.product_type, item.product_id))
                or "Marketplace item"
            )
            line_items.append(
                {
                    "price_data": {
                        "currency": currency_lower,
                        "product_data": {"name": title},
                        "unit_amount": to_cents(item.purchase_price),
                    },
                    "quantity": item.quantity,
                }
            )

        try:
            session = stripe.checkout.Session.create(
                mode="payment",
                line_items=line_items,
                customer_email=user.email,
                client_reference_id=str(user.id),
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={"order_id": str(order.id)},
            )
        except stripe.error.StripeError as exc:
            raise CheckoutError(
                "Unable to start checkout. Please try again.",
            ) from exc

        Payment.objects.create(
            order=order,
            stripe_checkout_session_id=session.id,
            amount=order.total_amount,
            currency=order.currency,
            status=Payment.Status.PENDING,
        )

        return {"checkout_url": session.url, "order_id": str(order.id)}

    @classmethod
    def confirm_checkout_session(cls, user: User, order_id: UUID) -> Order:
        """Sync paid Stripe Checkout Session → order when webhooks are delayed/missing.

        Security: owner-only; fulfillment only after Stripe reports payment_status=paid
        and session metadata.order_id matches the requested order.
        """
        from payments.webhook_service import WebhookService

        try:
            order = Order.objects.get(pk=order_id, user=user)
        except Order.DoesNotExist as exc:
            raise CheckoutError("Order not found.") from exc

        if (
            order.payment_status == Order.PaymentStatus.PAID
            and order.order_status == Order.OrderStatus.PAID
        ):
            return order

        if (
            order.order_status in TERMINAL_ORDER_STATUSES
            or order.payment_status in TERMINAL_PAYMENT_STATUSES
        ):
            raise CheckoutError("This order can no longer be confirmed.")

        payment = (
            Payment.objects.filter(order=order)
            .order_by("-created_at")
            .first()
        )
        if payment is None:
            raise CheckoutError("No payment found for this order.")

        if payment.status in STALE_LOCAL_PAYMENT_STATUSES:
            raise CheckoutError("This payment session is no longer valid.")

        session_id = payment.stripe_checkout_session_id
        if session_id.startswith("free_quote_"):
            return order

        if e2e_stripe_simulate_enabled() and session_id.startswith(
            E2E_CHECKOUT_SESSION_PREFIX
        ):
            # Same fulfillment path as checkout.session.completed (no live Stripe call).
            session = {
                "id": session_id,
                "payment_intent": f"pi_e2e_{uuid.uuid4().hex[:24]}",
                "payment_status": "paid",
                "metadata": {"order_id": str(order.id)},
            }
            with transaction.atomic():
                WebhookService._handle_checkout_completed(session)
            order.refresh_from_db()
            logger.info(
                "e2e_stripe_simulate confirm fulfilled order_id=%s",
                order.id,
            )
            return order

        if not settings.STRIPE_SECRET_KEY:
            raise CheckoutError("Payments are not configured. Please try again later.")

        try:
            session = stripe.checkout.Session.retrieve(session_id)
        except stripe.error.StripeError as exc:
            raise CheckoutError(
                "Unable to verify payment with Stripe. Please try again.",
            ) from exc

        metadata = session_value(session, "metadata") or {}
        meta_order_id = str(session_value(metadata, "order_id") or "")
        if meta_order_id != str(order.id):
            raise CheckoutError("Payment session does not match this order.")

        stripe_payment_status = str(session_value(session, "payment_status") or "")

        if stripe_payment_status != "paid":
            return order

        with transaction.atomic():
            WebhookService._handle_checkout_completed(session)
        order.refresh_from_db()
        return order
