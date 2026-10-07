"""Stripe Checkout session create/confirm for cart checkout."""

from __future__ import annotations

import logging
import uuid
from datetime import timedelta
from typing import TYPE_CHECKING, Any
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from config.locking import session_advisory_lock
from config.currency import validate_checkout_amount

from orders.models import Order
from orders.services import OrderError, OrderService
from payments.models import CheckoutAttempt, Payment
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

if TYPE_CHECKING:
    from accounts.models import User

logger = logging.getLogger(__name__)


class CheckoutService:
    @staticmethod
    def _stripe_error_code(exc: stripe.error.StripeError) -> str:
        code = str(getattr(exc, "code", "") or "")
        if code:
            return code
        body = getattr(exc, "json_body", None)
        if isinstance(body, dict):
            error = body.get("error")
            if isinstance(error, dict):
                return str(error.get("code") or "")
        return ""

    @classmethod
    def _expire_local_pending_checkout(cls, payment: Payment) -> None:
        """Close a verified-stale local checkout without touching paid rows."""
        with transaction.atomic():
            locked = Payment.objects.select_for_update().get(pk=payment.pk)
            if locked.status != Payment.Status.PENDING:
                raise CheckoutError('An earlier checkout changed while retrying.')
            locked.status = Payment.Status.EXPIRED
            locked.save(update_fields=['status', 'updated_at'])
            CheckoutAttempt.objects.filter(order_id=locked.order_id).update(
                status=CheckoutAttempt.Status.EXPIRED,
            )

    @classmethod
    def _request_payload(cls, order: Order, user: User) -> dict[str, Any]:
        frontend_base_url = settings.FRONTEND_BASE_URL.rstrip("/")
        fallback_titles = OrderService.build_catalog_titles(list(order.items.all()))
        line_items = []
        for item in order.items.all():
            title = item.title or fallback_titles.get((item.product_type, item.product_id)) or "Marketplace item"
            line_items.append({
                "price_data": {
                    "currency": order.currency.lower(),
                    "product_data": {"name": title},
                    "unit_amount": to_cents(item.purchase_price, order.currency),
                },
                "quantity": item.quantity,
            })
        return {
            "mode": "payment",
            "line_items": line_items,
            "customer_email": user.email,
            "client_reference_id": str(user.id),
            "success_url": f"{frontend_base_url}/checkout/success?order_id={order.id}",
            "cancel_url": f"{frontend_base_url}/checkout/cancel?order_id={order.id}",
            "metadata": {"order_id": str(order.id)},
            "payment_intent_data": {"metadata": {"order_id": str(order.id)}},
        }

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
        with session_advisory_lock(f"checkout-user:{user.pk}"):
            return cls._create_checkout_session_locked(user, accepted_legal=accepted_legal)

    @classmethod
    def _create_checkout_session_locked(cls, user, *, accepted_legal=None):
        cls._require_legal_acceptance(user, accepted_legal=accepted_legal)

        simulate = e2e_stripe_simulate_enabled()
        if not settings.STRIPE_SECRET_KEY and not simulate:
            raise CheckoutError("Payments are not configured. Please try again later.")
        payment_mode = getattr(settings, "STRIPE_PAYMENT_MODE", "test")
        if not simulate and not settings.STRIPE_SECRET_KEY.startswith(f"sk_{payment_mode}_"):
            raise CheckoutError("Payment configuration mode does not match the Stripe key.")

        # Commit the order snapshot and key BEFORE calling Stripe. A timeout or
        # crash after remote creation can then retry the exact same operation.
        with transaction.atomic():
            try:
                order = OrderService.create_from_cart(user, reuse_pending=True)
            except OrderError as exc:
                raise CheckoutError(exc.message, field=exc.field) from exc

            try:
                validate_checkout_amount(order.total_amount, order.currency)
                for item in order.items.all():
                    to_cents(item.purchase_price, order.currency)
            except ValueError as exc:
                raise CheckoutError(str(exc), field='amount') from exc

            attempt, _ = CheckoutAttempt.objects.get_or_create(order=order)
            if not attempt.request_payload:
                attempt.request_payload = cls._request_payload(order, user)
                attempt.save(update_fields=["request_payload", "updated_at"])
            existing = Payment.objects.filter(order=order, status=Payment.Status.PENDING).first()
            key_is_recent = attempt.created_at > timezone.now() - timedelta(hours=23)
            if existing and existing.checkout_url and attempt.status != CheckoutAttempt.Status.EXPIRED and key_is_recent:
                if not attempt.stripe_checkout_session_id:
                    attempt.stripe_checkout_session_id = existing.stripe_checkout_session_id
                    attempt.checkout_url = existing.checkout_url
                    attempt.status = CheckoutAttempt.Status.READY
                    attempt.save(update_fields=['stripe_checkout_session_id', 'checkout_url', 'status', 'updated_at'])
                return {'checkout_url': existing.checkout_url, 'order_id': str(order.id)}
            if attempt.status == CheckoutAttempt.Status.READY and attempt.checkout_url and key_is_recent:
                return {'checkout_url': attempt.checkout_url, 'order_id': str(order.id)}
            if attempt.status == CheckoutAttempt.Status.EXPIRED:
                raise CheckoutError('This checkout expired. Please retry your cart.')
            # Stripe can prune idempotency keys after 24 hours. Never resend
            # an unresolved operation once its key may no longer be retained.
            if attempt.created_at <= timezone.now() - timedelta(hours=23):
                raise CheckoutError('An earlier checkout needs reconciliation before retrying.')

        cls._supersede_other_checkouts(user, current_order_id=order.pk, simulate=simulate)

        success_url = attempt.request_payload["success_url"]
        if simulate:
            session_id = f"{E2E_CHECKOUT_SESSION_PREFIX}{uuid.uuid4().hex}"
            with transaction.atomic():
                Payment.objects.create(
                    order=order, stripe_checkout_session_id=session_id,
                    amount=order.total_amount, currency=order.currency,
                    status=Payment.Status.PENDING, checkout_url=success_url,
                )
                attempt.status = CheckoutAttempt.Status.READY
                attempt.stripe_checkout_session_id = session_id
                attempt.checkout_url = success_url
                attempt.save(update_fields=['status', 'stripe_checkout_session_id', 'checkout_url', 'updated_at'])
            logger.info(
                "e2e_stripe_simulate checkout created order_id=%s",
                order.id,
            )
            return {"checkout_url": success_url, "order_id": str(order.id)}

        try:
            session = stripe.checkout.Session.create(
                **attempt.request_payload,
                idempotency_key=f"checkout-attempt-{attempt.idempotency_key}",
            )
        except stripe.error.StripeError as exc:
            CheckoutAttempt.objects.filter(pk=attempt.pk, status=CheckoutAttempt.Status.PREPARED).update(
                status=CheckoutAttempt.Status.REVIEW,
            )
            raise CheckoutError(
                "Unable to start checkout. Please try again.",
            ) from exc

        with transaction.atomic():
            attempt = CheckoutAttempt.objects.select_for_update().get(pk=attempt.pk)
            if attempt.stripe_checkout_session_id and attempt.stripe_checkout_session_id != session.id:
                attempt.status = CheckoutAttempt.Status.REVIEW
                attempt.save(update_fields=['status', 'updated_at'])
                raise CheckoutError('Checkout session mismatch; contact support before paying.')
            payment, created = Payment.objects.get_or_create(
                order=order,
                defaults={
                    'stripe_checkout_session_id': session.id,
                    'amount': order.total_amount,
                    'currency': order.currency,
                    'status': Payment.Status.PENDING,
                    'checkout_url': session.url,
                },
            )
            if payment.stripe_checkout_session_id != session.id:
                raise CheckoutError('Checkout session mismatch; contact support before paying.')
            if not created and not payment.checkout_url:
                payment.checkout_url = session.url
                payment.save(update_fields=['checkout_url', 'updated_at'])
            attempt.status = CheckoutAttempt.Status.READY
            attempt.stripe_checkout_session_id = session.id
            attempt.checkout_url = session.url
            attempt.save(update_fields=['status', 'stripe_checkout_session_id', 'checkout_url', 'updated_at'])

        return {"checkout_url": session.url, "order_id": str(order.id)}

    @classmethod
    def _supersede_other_checkouts(cls, user, *, current_order_id, simulate: bool) -> None:
        """Expire earlier open sessions before a changed cart gets another one."""
        payment_mode = getattr(settings, "STRIPE_PAYMENT_MODE", "test")
        old_payments = Payment.objects.select_related('order').filter(
            order__user=user, status=Payment.Status.PENDING,
            order__order_status=Order.OrderStatus.PENDING,
        ).exclude(order_id=current_order_id)
        for payment in old_payments:
            session_id = payment.stripe_checkout_session_id
            if simulate and session_id.startswith(E2E_CHECKOUT_SESSION_PREFIX):
                remote_status = 'expired'
            else:
                try:
                    remote = stripe.checkout.Session.retrieve(session_id)
                    remote_status = str(session_value(remote, 'status') or '')
                    remote_payment_status = str(
                        session_value(remote, 'payment_status') or ''
                    )
                    if remote_status == 'open':
                        stripe.checkout.Session.expire(session_id)
                        remote_status = 'expired'
                except stripe.error.StripeError as exc:
                    error_code = cls._stripe_error_code(exc)
                    if payment_mode == "test" and error_code == "resource_missing":
                        # Sandbox sessions may disappear after test data is
                        # cleared or the account/key is changed. They cannot be
                        # charged through the currently configured test account,
                        # so release only the local pending checkout. Live mode
                        # intentionally remains fail-closed.
                        logger.warning(
                            "expiring_missing_sandbox_checkout order_id=%s session_id=%s",
                            payment.order_id,
                            session_id,
                        )
                        cls._expire_local_pending_checkout(payment)
                        continue
                    raise CheckoutError('An earlier checkout needs verification before retrying.') from exc
            if (
                payment_mode == "test"
                and remote_status == "complete"
                and remote_payment_status == "unpaid"
            ):
                # A completed-but-unpaid sandbox session cannot accept another
                # payment. Release the stale local row so testers can retry.
                logger.warning(
                    "expiring_unpaid_completed_sandbox_checkout order_id=%s session_id=%s",
                    payment.order_id,
                    session_id,
                )
                cls._expire_local_pending_checkout(payment)
                continue
            if remote_status != 'expired':
                raise CheckoutError('An earlier checkout needs verification before retrying.')
            cls._expire_local_pending_checkout(payment)

        # An unresolved attempt may have created a session remotely even though
        # its local Payment row is absent. Require recovery before changing carts.
        if CheckoutAttempt.objects.filter(
            order__user=user,
            order__order_status=Order.OrderStatus.PENDING,
            status__in=[CheckoutAttempt.Status.PREPARED, CheckoutAttempt.Status.REVIEW],
        ).exclude(order_id=current_order_id).exists():
            raise CheckoutError('An earlier checkout needs reconciliation before retrying.')

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
                "amount_total": to_cents(payment.amount, payment.currency),
                "currency": payment.currency.lower(),
                "client_reference_id": str(user.pk),
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
