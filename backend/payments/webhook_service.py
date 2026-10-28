"""Stripe webhook event handlers."""

from __future__ import annotations

import logging
from typing import Any

from django.db import IntegrityError, transaction

from cart.services import CartService
from config.currency import from_minor_units
from orders.entitlements import order_allows_download
from orders.models import Order, OrderItem
from orders.notifications import enqueue_payment_receipt
from orders.services import OrderError, OrderService
from payments.models import CheckoutAttempt, Payment, StripeWebhookEvent
from payments.payment_common import (
    STALE_LOCAL_PAYMENT_STATUSES,
    TERMINAL_ORDER_STATUSES,
    TERMINAL_PAYMENT_STATUSES,
    session_value,
    stripe,
    stripe_id,
    to_cents,
)

logger = logging.getLogger(__name__)

# Subscribe these event types on the Stripe Dashboard webhook (sandbox + live).
STRIPE_WEBHOOK_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed",
        "checkout.session.expired",
        "payment_intent.payment_failed",
        "charge.refunded",
        "charge.dispute.created",
        "charge.dispute.closed",
    }
)


class WebhookService:
    @classmethod
    def handle_event(cls, event) -> None:
        # Keep idempotency insert + processing in one transaction so a handler
        # crash rolls back the event row and Stripe retries can succeed.
        with transaction.atomic():
            try:
                with transaction.atomic():
                    StripeWebhookEvent.objects.create(
                        stripe_event_id=event.id,
                        event_type=event.type,
                    )
            except IntegrityError:
                return

            if event.type in {
                "checkout.session.completed",
                "checkout.session.async_payment_succeeded",
            }:
                cls._handle_checkout_completed(event.data.object)
            elif event.type == "checkout.session.expired":
                cls._handle_checkout_expired(event.data.object)
            elif event.type == "checkout.session.async_payment_failed":
                cls._handle_checkout_failed(event.data.object)
            elif event.type == "payment_intent.payment_failed":
                cls._handle_payment_failed(event.data.object)
            elif event.type == "charge.refunded":
                cls._handle_charge_refunded(event.data.object)
            elif event.type in {"charge.dispute.created", "charge.dispute.closed"}:
                cls._handle_dispute(event.data.object, closed=event.type.endswith(".closed"))
            elif event.type not in STRIPE_WEBHOOK_EVENT_TYPES:
                logger.info("Ignoring unhandled Stripe event type=%s", event.type)

    @classmethod
    def _handle_checkout_completed(cls, session) -> None:
        session_id = stripe_id(session) or str(session_value(session, "id") or "")
        try:
            payment = Payment.objects.select_for_update().select_related("order").get(
                stripe_checkout_session_id=session_id
            )
        except Payment.DoesNotExist:
            payment = cls._recover_payment(session)

        if payment.status == Payment.Status.SUCCEEDED:
            return

        order = payment.order
        validation_error = cls._checkout_fulfillment_validation_error(
            session,
            payment=payment,
            order=order,
        )
        if validation_error:
            logger.warning(
                "Ignoring Stripe checkout fulfillment for payment %s: %s",
                payment.pk,
                validation_error,
            )
            # A paid session we cannot fulfill must not be acknowledged: raising
            # rolls back the event row, so Stripe retries and the failure alerts.
            if str(session_value(session, "payment_status") or "").lower() == "paid":
                raise RuntimeError(
                    f"Paid checkout failed fulfillment validation: {validation_error}"
                )
            return

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
            if payment.status in {Payment.Status.EXPIRED, Payment.Status.FAILED} or (
                order.order_status == Order.OrderStatus.CANCELLED
                and payment.status == Payment.Status.PENDING
            ):
                raise RuntimeError("Paid stale checkout requires operator reconciliation.")
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
        if (
            payment.stripe_payment_intent_id
            and payment.stripe_payment_intent_id != payment_intent
        ):
            raise ValueError("Checkout payment intent does not match the stored intent.")
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
            CartService.remove_items(order.user, purchased_keys, before=order.created_at)

        # After commit: Stripe fulfillment stays in-process; email is async.
        enqueue_payment_receipt(order)

    @classmethod
    def _recover_payment(cls, session):
        """A webhook may beat the response that persists the Stripe session."""
        session_id = stripe_id(session) or str(session_value(session, "id") or "")
        metadata = session_value(session, "metadata") or {}
        order_id = str(session_value(metadata, "order_id") or "")
        if not session_id or not order_id:
            raise RuntimeError("Checkout session cannot be associated; retry delivery.")
        try:
            attempt = CheckoutAttempt.objects.select_for_update().select_related("order").get(
                order_id=order_id
            )
        except (CheckoutAttempt.DoesNotExist, ValueError):
            raise RuntimeError("Checkout attempt is not available yet; retry delivery.") from None
        if attempt.status == CheckoutAttempt.Status.EXPIRED:
            raise RuntimeError("Expired checkout unexpectedly settled; investigate payment.")
        if attempt.stripe_checkout_session_id not in (None, session_id):
            raise ValueError("Checkout attempt session does not match the webhook.")
        order = attempt.order
        payment = Payment(
            order=order, stripe_checkout_session_id=session_id,
            amount=order.total_amount, currency=order.currency,
        )
        reason = cls._checkout_fulfillment_validation_error(
            session, payment=payment, order=order, require_paid=False,
        )
        if reason:
            raise ValueError(f"Untrusted checkout recovery: {reason}")
        payment, _ = Payment.objects.get_or_create(
            order=order,
            defaults={
                "stripe_checkout_session_id": session_id,
                "amount": order.total_amount,
                "currency": order.currency,
                "checkout_url": attempt.checkout_url,
            },
        )
        if payment.stripe_checkout_session_id != session_id:
            raise ValueError("Stored payment session does not match the webhook.")
        attempt.stripe_checkout_session_id = session_id
        attempt.status = CheckoutAttempt.Status.READY
        attempt.save(update_fields=["stripe_checkout_session_id", "status", "updated_at"])
        return payment

    @classmethod
    def _checkout_fulfillment_validation_error(
        cls,
        session,
        *,
        payment: Payment,
        order: Order,
        require_paid: bool = True,
    ) -> str | None:
        """Return a safe log reason when a Stripe session must not fulfill."""
        if require_paid and str(session_value(session, "payment_status") or "").lower() != "paid":
            return "Stripe payment_status is not paid"

        metadata = session_value(session, "metadata") or {}
        metadata_order_id = str(session_value(metadata, "order_id") or "")
        if metadata_order_id != str(order.pk):
            return "metadata order_id does not match the stored order"

        client_reference_id = str(
            session_value(session, "client_reference_id") or ""
        )
        if client_reference_id != str(order.user_id):
            return "client_reference_id does not match the order customer"

        session_currency = str(session_value(session, "currency") or "").upper()
        payment_currency = str(payment.currency or "").upper()
        order_currency = str(order.currency or "").upper()
        if not session_currency or session_currency != payment_currency:
            return "Stripe currency does not match the stored payment"
        if payment_currency != order_currency:
            return "stored payment currency does not match the order"

        raw_amount_total = session_value(session, "amount_total")
        try:
            amount_total = int(raw_amount_total)
        except (TypeError, ValueError):
            return "Stripe amount_total is missing or invalid"
        try:
            expected_amount = to_cents(payment.amount, payment.currency)
        except ValueError:
            return 'Stored payment amount/currency is invalid'
        if isinstance(raw_amount_total, bool) or str(raw_amount_total) != str(amount_total):
            return 'Stripe amount_total is not an integer'
        if amount_total != expected_amount:
            return "Stripe amount_total does not match the stored payment"
        if payment.amount != order.total_amount:
            return "stored payment amount does not match the order"

        return None

    @classmethod
    def _handle_checkout_expired(cls, session) -> None:
        session_id = stripe_id(session) or str(session_value(session, "id") or "")
        try:
            payment = Payment.objects.select_for_update().select_related("order").get(
                stripe_checkout_session_id=session_id,
                status=Payment.Status.PENDING,
            )
        except Payment.DoesNotExist:
            if Payment.objects.filter(stripe_checkout_session_id=session_id).exists():
                return
            try:
                payment = cls._recover_payment(session)
            except RuntimeError:
                return

        payment.status = Payment.Status.EXPIRED
        payment.save(update_fields=["status", "updated_at"])
        CheckoutAttempt.objects.filter(order_id=payment.order_id).update(status=CheckoutAttempt.Status.EXPIRED)

    @classmethod
    def _handle_checkout_failed(cls, session) -> None:
        session_id = stripe_id(session) or str(session_value(session, "id") or "")
        try:
            payment = Payment.objects.select_for_update().get(stripe_checkout_session_id=session_id)
        except Payment.DoesNotExist:
            payment = cls._recover_payment(session)
        if payment.status == Payment.Status.PENDING:
            payment.status = Payment.Status.FAILED
            payment.save(update_fields=["status", "updated_at"])
            CheckoutAttempt.objects.filter(order_id=payment.order_id).update(status=CheckoutAttempt.Status.EXPIRED)

    @classmethod
    def _handle_payment_failed(cls, payment_intent) -> None:
        intent_id = stripe_id(payment_intent)
        # A PaymentIntent can fail during a still-open Checkout session and then
        # succeed with a different payment method. Only the terminal Checkout
        # event may fail the local payment.
        logger.info("Stripe payment intent failed intent_id=%s", intent_id)

    @classmethod
    def _handle_charge_refunded(cls, charge: Any) -> None:
        """Full Stripe charge refund → Payment + Order refunded; revoke entitlement.

        Partial refunds (``charge.refunded`` is false) are ignored in Phase B.
        """
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
            raise RuntimeError("Refund payment is not available yet; retry delivery.")

        if payment.status == Payment.Status.REFUNDED:
            return

        # Partial refunds retain access; record the cumulative amount for audit.
        raw_refunded = session_value(charge, "amount_refunded")
        if raw_refunded is not None:
            amount = from_minor_units(raw_refunded, payment.currency)
            if amount < 0 or amount > payment.amount:
                raise ValueError("Refund amount is outside the payment amount.")
            payment.refunded_amount = max(payment.refunded_amount, amount)
            payment.save(update_fields=["refunded_amount", "updated_at"])
        if not bool(session_value(charge, "refunded")):
            return

        if payment.status not in {Payment.Status.SUCCEEDED, Payment.Status.DISPUTED}:
            logger.warning(
                "Ignoring charge.refunded for non-succeeded payment %s "
                "(status=%s intent=%s)",
                payment.pk,
                payment.status,
                intent_id,
            )
            raise RuntimeError("Payment has not settled yet; retry refund delivery.")

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

    @classmethod
    def _handle_dispute(cls, dispute, *, closed):
        intent_id = stripe_id(session_value(dispute, "payment_intent"))
        if not intent_id:
            raise ValueError("Dispute does not contain a payment intent.")
        payment = Payment.objects.filter(stripe_payment_intent_id=intent_id).first()
        if payment is None:
            raise RuntimeError("Dispute references an unknown payment intent; retry delivery.")
        if payment.status == Payment.Status.REFUNDED:
            return
        if payment.status not in {Payment.Status.SUCCEEDED, Payment.Status.DISPUTED}:
            raise RuntimeError("Disputed payment has not settled yet; retry delivery.")
        # Retrieve authoritative state before taking the row lock, so the Stripe
        # network call does not hold a database lock. A delayed 'created' must
        # not undo 'won'.
        current = stripe.Dispute.retrieve(stripe_id(dispute))
        state = str(session_value(current, "status") or "")

        payment = Payment.objects.select_for_update().get(pk=payment.pk)
        if payment.status == Payment.Status.REFUNDED:
            return
        if payment.status not in {Payment.Status.SUCCEEDED, Payment.Status.DISPUTED}:
            raise RuntimeError("Disputed payment has not settled yet; retry delivery.")
        payment.status = Payment.Status.SUCCEEDED if state == "won" else Payment.Status.DISPUTED
        payment.save(update_fields=["status", "updated_at"])
