from __future__ import annotations

import logging
import uuid
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

import stripe
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q, QuerySet
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from cart.services import CartService
from coupons.services import CouponService
from orders.entitlements import order_allows_download
from orders.models import Order, OrderItem
from orders.notifications import enqueue_payment_receipt
from orders.services import OrderError, OrderService

from payments.models import Payment, StripeWebhookEvent

User = get_user_model()
logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY

_E2E_CHECKOUT_SESSION_PREFIX = "cs_test_e2e_"


def _e2e_stripe_simulate_enabled() -> bool:
    return bool(getattr(settings, "E2E_STRIPE_SIMULATE", False))

_TERMINAL_ORDER_STATUSES = {
    Order.OrderStatus.CANCELLED,
    Order.OrderStatus.REFUNDED,
}
_TERMINAL_PAYMENT_STATUSES = {
    Order.PaymentStatus.CANCELLED,
    Order.PaymentStatus.REFUNDED,
}
_STALE_LOCAL_PAYMENT_STATUSES = {
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
    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


class AdminPaymentError(Exception):
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


def _normalize_status_filter(value: str) -> str:
    normalized = value.strip().lower()
    return PAYMENT_STATUS_FILTER_ALIASES.get(normalized, normalized)


def _parse_day_bound(
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


class AdminPaymentService:
    @classmethod
    def list_admin(
        cls,
        *,
        status: str | None = None,
        search: str | None = None,
        created_after: str | None = None,
        created_before: str | None = None,
        ordering: str = "-created_at",
    ) -> QuerySet[Payment]:
        queryset = Payment.objects.select_related("order", "order__user")

        if status:
            queryset = queryset.filter(status=_normalize_status_filter(status))

        if search:
            term = search.strip()
            if term:
                queryset = queryset.filter(
                    Q(order__invoice_number__icontains=term)
                    | Q(order__user__email__icontains=term)
                )

        after = _parse_day_bound(created_after, end_of_day=False)
        before = _parse_day_bound(created_before, end_of_day=True)
        if isinstance(after, date) and not isinstance(after, datetime):
            queryset = queryset.filter(created_at__date__gte=after)
        elif after is not None:
            queryset = queryset.filter(created_at__gte=after)
        if isinstance(before, date) and not isinstance(before, datetime):
            queryset = queryset.filter(created_at__date__lte=before)
        elif before is not None:
            queryset = queryset.filter(created_at__lte=before)

        order_by = ordering if ordering in PAYMENT_ORDERING_FIELDS else "-created_at"
        return queryset.order_by(order_by)

    @classmethod
    def get(cls, payment_id: UUID) -> Payment:
        try:
            return Payment.objects.select_related("order", "order__user").get(pk=payment_id)
        except Payment.DoesNotExist as exc:
            raise AdminPaymentError("Payment not found.") from exc


class CheckoutService:
    @classmethod
    def create_checkout_session(cls, user: User) -> dict[str, str]:
        simulate = _e2e_stripe_simulate_enabled()
        if not settings.STRIPE_SECRET_KEY and not simulate:
            raise CheckoutError("Payments are not configured. Please try again later.")

        try:
            order, discount_amount, coupon = OrderService.create_from_cart(user)
        except OrderError as exc:
            raise CheckoutError(exc.message, field=exc.field) from exc

        frontend_base_url = settings.FRONTEND_BASE_URL.rstrip("/")
        success_url = f"{frontend_base_url}/checkout/success?order_id={order.id}"
        cancel_url = f"{frontend_base_url}/checkout/cancel?order_id={order.id}"

        if simulate:
            session_id = f"{_E2E_CHECKOUT_SESSION_PREFIX}{uuid.uuid4().hex}"
            Payment.objects.create(
                order=order,
                coupon=coupon,
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

        try:
            session = stripe.checkout.Session.create(
                mode="payment",
                line_items=line_items,
                discounts=discounts or None,
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
            coupon=coupon,
            stripe_checkout_session_id=session.id,
            amount=order.total_amount,
            currency=order.currency,
            status=Payment.Status.PENDING,
        )

        return {"checkout_url": session.url, "order_id": str(order.id)}

    @classmethod
    def _expire_stripe_sessions(cls, session_ids: list[str]) -> None:
        """Best-effort expire open Stripe Checkout Sessions (superseded checkouts)."""
        if not settings.STRIPE_SECRET_KEY:
            return
        for session_id in session_ids:
            if not session_id or session_id.startswith("free_quote_"):
                continue
            try:
                stripe.checkout.Session.expire(session_id)
            except stripe.error.StripeError as exc:
                logger.warning(
                    "Unable to expire superseded Stripe session %s: %s",
                    session_id,
                    exc,
                )

    @classmethod
    def _expire_pending_quotation_sessions(
        cls,
        *,
        user: User,
        project_id: UUID,
    ) -> None:
        """Expire Stripe sessions for prior unfinished quotation checkouts."""
        session_ids = list(
            Payment.objects.filter(
                order__user=user,
                order__order_status=Order.OrderStatus.PENDING,
                order__payment_status=Order.PaymentStatus.PENDING,
                status=Payment.Status.PENDING,
                order__items__product_type=OrderItem.ProductType.CUSTOM_PROJECT,
                order__items__product_id=project_id,
            )
            .exclude(stripe_checkout_session_id="")
            .values_list("stripe_checkout_session_id", flat=True)
            .distinct()
        )
        cls._expire_stripe_sessions(session_ids)

    @classmethod
    def create_quotation_checkout_session(
        cls,
        user: User,
        project_id: UUID,
    ) -> dict[str, str]:
        from custom_projects.models import CustomProject

        # Close prior open Stripe sessions before local supersede cancels those orders.
        cls._expire_pending_quotation_sessions(user=user, project_id=project_id)

        try:
            order = OrderService.create_from_quotation(user, project_id)
        except OrderError as exc:
            raise CheckoutError(exc.message, field=exc.field) from exc

        # Mark project payment as pending while Stripe Checkout is open.
        CustomProject.objects.filter(pk=project_id).exclude(
            payment_status=CustomProject.PaymentStatus.PAID
        ).update(
            payment_status=CustomProject.PaymentStatus.PENDING,
            updated_at=timezone.now(),
        )

        frontend_base_url = settings.FRONTEND_BASE_URL.rstrip("/")

        if order.total_amount <= Decimal("0.00"):
            # Free / zero quotes: fulfill without Stripe hosted checkout.
            with transaction.atomic():
                Payment.objects.create(
                    order=order,
                    stripe_checkout_session_id=f"free_quote_{order.id}",
                    amount=order.total_amount,
                    currency=order.currency,
                    status=Payment.Status.SUCCEEDED,
                )
                OrderService.update_order_status(order, Order.OrderStatus.PAID)
                OrderService.update_payment_status(order, Order.PaymentStatus.PAID)
                cls._fulfill_custom_project_payment(order)
                enqueue_payment_receipt(order)
            return {
                "checkout_url": (
                    f"{frontend_base_url}/checkout/success"
                    f"?order_id={order.id}&project_id={project_id}"
                ),
                "order_id": str(order.id),
                "project_id": str(project_id),
            }

        if not settings.STRIPE_SECRET_KEY:
            raise CheckoutError("Payments are not configured. Please try again later.")

        line_item = order.items.first()
        title = (line_item.title if line_item else None) or "Custom project quotation"
        currency_lower = order.currency.lower()

        try:
            session = stripe.checkout.Session.create(
                mode="payment",
                line_items=[
                    {
                        "price_data": {
                            "currency": currency_lower,
                            "product_data": {"name": title},
                            "unit_amount": _to_cents(order.total_amount),
                        },
                        "quantity": 1,
                    }
                ],
                customer_email=user.email,
                client_reference_id=str(user.id),
                success_url=(
                    f"{frontend_base_url}/checkout/success"
                    f"?order_id={order.id}&project_id={project_id}"
                ),
                cancel_url=(
                    f"{frontend_base_url}/checkout/cancel"
                    f"?order_id={order.id}&project_id={project_id}"
                ),
                metadata={
                    "order_id": str(order.id),
                    "project_id": str(project_id),
                    "checkout_type": "quotation",
                },
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

        return {
            "checkout_url": session.url,
            "order_id": str(order.id),
            "project_id": str(project_id),
        }

    @classmethod
    def confirm_checkout_session(cls, user: User, order_id: UUID) -> Order:
        """Sync paid Stripe Checkout Session → order when webhooks are delayed/missing.

        Security: owner-only; fulfillment only after Stripe reports payment_status=paid
        and session metadata.order_id matches the requested order.
        """
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
            order.order_status in _TERMINAL_ORDER_STATUSES
            or order.payment_status in _TERMINAL_PAYMENT_STATUSES
        ):
            raise CheckoutError("This order can no longer be confirmed.")

        payment = (
            Payment.objects.filter(order=order)
            .order_by("-created_at")
            .first()
        )
        if payment is None:
            raise CheckoutError("No payment found for this order.")

        if payment.status in _STALE_LOCAL_PAYMENT_STATUSES:
            raise CheckoutError("This payment session is no longer valid.")

        session_id = payment.stripe_checkout_session_id
        if session_id.startswith("free_quote_"):
            return order

        if _e2e_stripe_simulate_enabled() and session_id.startswith(
            _E2E_CHECKOUT_SESSION_PREFIX
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

        metadata = _session_value(session, "metadata") or {}
        meta_order_id = str(_session_value(metadata, "order_id") or "")
        if meta_order_id != str(order.id):
            raise CheckoutError("Payment session does not match this order.")

        stripe_payment_status = str(_session_value(session, "payment_status") or "")

        if stripe_payment_status != "paid":
            return order

        with transaction.atomic():
            WebhookService._handle_checkout_completed(session)
        order.refresh_from_db()
        return order

    @classmethod
    def _fulfill_custom_project_payment(cls, order: Order) -> None:
        from custom_projects.services import CustomProjectService

        project_ids = order.items.filter(
            product_type=OrderItem.ProductType.CUSTOM_PROJECT
        ).values_list("product_id", flat=True)
        for project_id in project_ids:
            CustomProjectService.mark_quotation_paid(project_id)


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

        order = payment.order
        # Superseded / cancelled checkouts must not fulfill (stale Stripe session).
        if (
            payment.status in _STALE_LOCAL_PAYMENT_STATUSES
            or order.order_status in _TERMINAL_ORDER_STATUSES
            or order.payment_status in _TERMINAL_PAYMENT_STATUSES
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

        payment_intent = _stripe_id(_session_value(session, "payment_intent"))
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
    def _handle_checkout_expired(cls, session: "stripe.checkout.Session") -> None:
        session_id = _stripe_id(session) or str(_session_value(session, "id") or "")
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
    def _handle_payment_failed(cls, payment_intent: "stripe.PaymentIntent") -> None:
        intent_id = _stripe_id(payment_intent)
        Payment.objects.filter(
            stripe_payment_intent_id=intent_id,
            status=Payment.Status.PENDING,
        ).update(status=Payment.Status.FAILED)
