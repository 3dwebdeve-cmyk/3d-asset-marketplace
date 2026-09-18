"""Stripe webhook event handlers."""

from __future__ import annotations

import logging
from typing import Any

from django.db import IntegrityError, transaction

from cart.services import CartService
from coupons.services import CouponService
from orders.entitlements import order_allows_download
from orders.models import Order, OrderItem
from orders.notifications import enqueue_payment_receipt
from orders.services import OrderError, OrderService
from payments.checkout_service import CheckoutService
from payments.models import Payment, StripeWebhookEvent
from payments.payment_common import (
    STALE_LOCAL_PAYMENT_STATUSES,
    TERMINAL_ORDER_STATUSES,
    TERMINAL_PAYMENT_STATUSES,
    session_value,
    stripe_id,
)

logger = logging.getLogger(__name__)

# Subscribe these event types on the Stripe Dashboard webhook (sandbox + live).
STRIPE_WEBHOOK_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "checkout.session.completed",
        "checkout.session.expired",
        "payment_intent.payment_failed",
        "charge.refunded",
    }
)


class WebhookService:
    @classmethod
    def handle_event(cls, event) -> None:
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
            elif event.type == "charge.refunded":
                cls._handle_charge_refunded(event.data.object)
            elif event.type not in STRIPE_WEBHOOK_EVENT_TYPES:
                logger.info("Ignoring unhandled Stripe event type=%s", event.type)

    @classmethod
    def _handle_checkout_completed(cls, session) -> None:
        # Note: coupon is a nullable FK, so it is intentionally excluded from
        # select_related here — Postgres rejects SELECT ... FOR UPDATE across
        # a LEFT OUTER JOIN ("nullable side"). payment.coupon is instead
        # lazy-loaded (unlocked) just below when needed.
        session_id = stripe_id(session) or str(session_value(session, "id") or "")
        try:
            payment = Payment.objects.select_for_update().select_related("order").get(
                stripe_checkout_session_id=session_id
            )
        except Payment.DoesNotExist:
            return

        if payment.status == Payment.Status.SUCCEEDED:
            return

        order = payment.order
        # Superseded / cancelled checkouts must not fulfill (stale Stripe session).
        if (
            payment.status in STALE_LOCAL_PAYMENT_STATUSES
            or order.order_status in TERMINAL_ORDER_STATUSES
            or order.payment_status in TERMINAL_PAYMENT_STATUSES
        ):
            logger.warning(
                "Ignoring checkout.session.completed for stale payment %s "
                "(payment_status=%s order_status=%s payment_order_status=%s)",
                payment.pk,
                payment.status,
                order.order_status,
                order.payment_status,
            )
            return

        if (
            order.order_status != Order.OrderStatus.PENDING
            or order.payment_status != Order.PaymentStatus.PENDING
        ):
            logger.warning(
                "Ignoring checkout.session.completed for non-pending order %s "
                "(order_status=%s payment_status=%s)",
                order.pk,
                order.order_status,
                order.payment_status,
            )
            return

        payment_intent = stripe_id(session_value(session, "payment_intent"))
        payment.status = Payment.Status.SUCCEEDED
        payment.stripe_payment_intent_id = payment_intent
        payment.save(update_fields=["status", "stripe_payment_intent_id", "updated_at"])

        if not order_allows_download(order):
            if order.order_status == Order.OrderStatus.PENDING:
                order = OrderService.update_order_status(order, Order.OrderStatus.PAID)
            if order.payment_status == Order.PaymentStatus.PENDING:
                order = OrderService.update_payment_status(order, Order.PaymentStatus.PAID)

        purchased_keys = {
            (item.product_type, item.product_id)
            for item in order.items.all()
            if item.product_type
            in {OrderItem.ProductType.PRODUCT, OrderItem.ProductType.PLUGIN}
        }
        if purchased_keys:
            CartService.remove_items(order.user, purchased_keys)

        if payment.coupon_id is not None:
            CouponService.increment_usage(payment.coupon)

        CheckoutService._fulfill_custom_project_payment(order)
        # After commit: Stripe fulfillment stays in-process; email is async.
        enqueue_payment_receipt(order)

    @classmethod
    def _handle_checkout_expired(cls, session) -> None:
        session_id = stripe_id(session) or str(session_value(session, "id") or "")
        try:
            payment = Payment.objects.select_related("order").get(
                stripe_checkout_session_id=session_id,
                status=Payment.Status.PENDING,
            )
        except Payment.DoesNotExist:
            return

        payment.status = Payment.Status.EXPIRED
        payment.save(update_fields=["status", "updated_at"])

        from custom_projects.services import CustomProjectService

        for project_id in payment.order.items.filter(
            product_type=OrderItem.ProductType.CUSTOM_PROJECT
        ).values_list("product_id", flat=True):
            CustomProjectService.revert_quotation_payment_pending(project_id)

    @classmethod
    def _handle_payment_failed(cls, payment_intent) -> None:
        intent_id = stripe_id(payment_intent)
        Payment.objects.filter(
            stripe_payment_intent_id=intent_id,
            status=Payment.Status.PENDING,
        ).update(status=Payment.Status.FAILED)

    @classmethod
    def _handle_charge_refunded(cls, charge: Any) -> None:
        """Full Stripe charge refund → Payment + Order refunded; revoke entitlement.

        Partial refunds (``charge.refunded`` is false) are ignored in Phase B.
        """
        if not bool(session_value(charge, "refunded")):
            logger.info(
                "Ignoring partial charge.refunded charge_id=%s",
                stripe_id(charge) or session_value(charge, "id"),
            )
            return

        intent_id = stripe_id(session_value(charge, "payment_intent"))
        if not intent_id:
            logger.warning(
                "charge.refunded missing payment_intent charge_id=%s",
                stripe_id(charge) or session_value(charge, "id"),
            )
            return

        try:
            payment = (
                Payment.objects.select_for_update()
                .select_related("order")
                .get(stripe_payment_intent_id=intent_id)
            )
        except Payment.DoesNotExist:
            logger.warning(
                "charge.refunded for unknown payment_intent=%s",
                intent_id,
            )
            return

        if payment.status == Payment.Status.REFUNDED:
            return

        if payment.status != Payment.Status.SUCCEEDED:
            logger.warning(
                "Ignoring charge.refunded for non-succeeded payment %s "
                "(status=%s intent=%s)",
                payment.pk,
                payment.status,
                intent_id,
            )
            return

        payment.status = Payment.Status.REFUNDED
        payment.save(update_fields=["status", "updated_at"])

        try:
            OrderService.mark_refunded(payment.order)
        except OrderError:
            logger.exception(
                "order_mark_refunded_failed payment_id=%s order_id=%s",
                payment.pk,
                payment.order_id,
            )
            raise
