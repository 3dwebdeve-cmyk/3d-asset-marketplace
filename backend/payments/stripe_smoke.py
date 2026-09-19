"""Phase B1 — signed webhook fulfill smoke (test-mode only).

Creates a real Stripe Checkout Session with sk_test_, posts a HMAC-signed
checkout.session.completed to the same view Stripe hits, asserts paid order /
payment / entitlement / receipt, then replays for idempotency.

Never prints secret key material.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.core import mail
from django.test import Client, override_settings
from django.urls import reverse

from accounts.legal_service import LegalAcceptanceService
from accounts.models import Role, User
from cart.models import Cart, CartItem
from categories.models import Category
from downloads.services import DownloadService
from orders.entitlements import order_allows_download, user_owns_catalog_item
from orders.models import Order, OrderItem
from payments.checkout_service import CheckoutService
from payments.models import Payment, StripeWebhookEvent
from payments.payment_common import e2e_stripe_simulate_enabled, stripe
from payments.stripe_config import collect_stripe_config_report
from products.models import Product


SMOKE_EMAIL_PREFIX = "stripe-smoke-"
SMOKE_PRODUCT_SLUG_PREFIX = "stripe-smoke-"
SMOKE_CATEGORY_SLUG = "stripe-smoke-props"


@dataclass(frozen=True)
class StripeFulfillSmokeResult:
    order_id: str
    payment_id: str
    stripe_session_id: str
    event_id: str
    entitlement_ok: bool
    receipt_sent: bool
    replay_idempotent: bool
    cleaned_up: bool


class StripeSmokeError(Exception):
    """Operator-facing smoke failure (no secrets in message)."""


def sign_stripe_webhook_payload(
    payload: bytes | str,
    secret: str,
    *,
    timestamp: int | None = None,
) -> str:
    """Build Stripe-Signature header matching Webhook.construct_event."""
    raw_secret = (secret or "").strip()
    if not raw_secret:
        raise StripeSmokeError("STRIPE_WEBHOOK_SECRET is empty.")
    ts = int(time.time()) if timestamp is None else timestamp
    body = payload.decode("utf-8") if isinstance(payload, bytes) else payload
    signed = f"{ts}.{body}"
    digest = hmac.new(
        raw_secret.encode("utf-8"),
        msg=signed.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    return f"t={ts},v1={digest}"


def _build_checkout_completed_payload(
    *,
    event_id: str,
    session_id: str,
    payment_intent_id: str,
    order_id: str,
) -> bytes:
    event: dict[str, Any] = {
        "id": event_id,
        "object": "event",
        "api_version": "2024-11-20.acacia",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": session_id,
                "object": "checkout.session",
                "payment_intent": payment_intent_id,
                "metadata": {"order_id": order_id},
            }
        },
    }
    return json.dumps(event, separators=(",", ":")).encode("utf-8")


def _post_signed_webhook(client: Client, payload: bytes, secret: str):
    signature = sign_stripe_webhook_payload(payload, secret)
    return client.post(
        reverse("payments:webhook"),
        data=payload,
        content_type="application/json",
        HTTP_STRIPE_SIGNATURE=signature,
    )


def run_sandbox_fulfill_smoke(*, cleanup: bool = True) -> StripeFulfillSmokeResult:
    """End-to-end test-mode fulfill via real Session.create + signed webhook."""
    if e2e_stripe_simulate_enabled():
        raise StripeSmokeError(
            "E2E_STRIPE_SIMULATE is True — refuse smoke. "
            "Set E2E_STRIPE_SIMULATE=False for real webhook testing "
            "(docs/STRIPE_SANDBOX_CHECKLIST.md)."
        )

    report = collect_stripe_config_report(require_test_mode=True)
    if report.warnings:
        raise StripeSmokeError(
            "Stripe config not ready for sandbox smoke: "
            + "; ".join(report.warnings)
        )
    if report.secret_mode != "test":
        raise StripeSmokeError(
            "STRIPE_SECRET_KEY must be sk_test_… for sandbox smoke."
        )

    webhook_secret = (settings.STRIPE_WEBHOOK_SECRET or "").strip()
    token = uuid.uuid4().hex[:12]
    email = f"{SMOKE_EMAIL_PREFIX}{token}@example.com"
    product_slug = f"{SMOKE_PRODUCT_SLUG_PREFIX}{token}"
    event_id = f"evt_smoke_{token}"
    payment_intent_id = f"pi_smoke_{token}"

    role = Role.objects.get(role_name="Customer")
    user = User.objects.create_user(
        email=email,
        full_name="Stripe Smoke Buyer",
        password=uuid.uuid4().hex,
        role=role,
        email_verified=True,
    )
    LegalAcceptanceService.record_acceptances(
        user,
        LegalAcceptanceService.current_versions(),
    )

    category, _ = Category.objects.get_or_create(
        slug=SMOKE_CATEGORY_SLUG,
        defaults={"name": "Stripe Smoke Props"},
    )
    product = Product.objects.create(
        category=category,
        name=f"Stripe Smoke Asset {token}",
        slug=product_slug,
        price=Decimal("9.99"),
        status=Product.Status.PUBLISHED,
    )
    cart, _ = Cart.objects.get_or_create(user=user)
    CartItem.objects.create(
        cart=cart,
        product_type=CartItem.ProductType.PRODUCT,
        product_id=product.pk,
        quantity=1,
    )

    session_id = ""
    order: Order | None = None
    payment: Payment | None = None
    result: StripeFulfillSmokeResult | None = None

    try:
        checkout = CheckoutService.create_checkout_session(
            user,
            accepted_legal=LegalAcceptanceService.current_versions(),
        )
        order = Order.objects.get(pk=checkout["order_id"])
        payment = Payment.objects.select_related("order").get(order=order)
        session_id = payment.stripe_checkout_session_id or ""
        if not session_id.startswith("cs_"):
            raise StripeSmokeError(
                "Checkout did not return a Stripe session id "
                "(unexpected simulate or misconfiguration)."
            )

        payload = _build_checkout_completed_payload(
            event_id=event_id,
            session_id=session_id,
            payment_intent_id=payment_intent_id,
            order_id=str(order.pk),
        )

        with override_settings(
            CELERY_TASK_ALWAYS_EAGER=True,
            EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
            ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"],
        ):
            # Locmem attaches mail.outbox on first connection (not at import).
            from django.core.mail import get_connection

            get_connection(
                backend="django.core.mail.backends.locmem.EmailBackend"
            )
            if not hasattr(mail, "outbox"):
                mail.outbox = []
            mail.outbox.clear()
            client = Client()
            first = _post_signed_webhook(client, payload, webhook_secret)
            if first.status_code != 200:
                raise StripeSmokeError(
                    f"Webhook fulfill returned HTTP {first.status_code} "
                    "(expected 200). Check STRIPE_WEBHOOK_SECRET matches "
                    "the signing secret used by this env, and ALLOWED_HOSTS "
                    "permits the smoke client host."
                )

            order.refresh_from_db()
            payment.refresh_from_db()
            if payment.status != Payment.Status.SUCCEEDED:
                raise StripeSmokeError(
                    f"Payment status={payment.status} after webhook "
                    "(expected succeeded)."
                )
            if not order_allows_download(order):
                raise StripeSmokeError(
                    "Order not paid/entitled after webhook "
                    f"(order_status={order.order_status}, "
                    f"payment_status={order.payment_status})."
                )
            if not user_owns_catalog_item(
                user,
                OrderItem.ProductType.PRODUCT,
                product.pk,
            ):
                raise StripeSmokeError(
                    "Download entitlement missing after webhook."
                )
            owned = DownloadService.list_owned_catalog_keys(user)
            if (OrderItem.ProductType.PRODUCT, product.pk) not in owned:
                raise StripeSmokeError(
                    "DownloadService did not list purchased catalog key."
                )

            if len(mail.outbox) < 1:
                raise StripeSmokeError(
                    "Payment receipt email was not sent "
                    "(eager Celery + locmem backend)."
                )

            second = _post_signed_webhook(client, payload, webhook_secret)
            if second.status_code != 200:
                raise StripeSmokeError(
                    f"Webhook replay returned HTTP {second.status_code}."
                )
            if StripeWebhookEvent.objects.filter(stripe_event_id=event_id).count() != 1:
                raise StripeSmokeError(
                    "StripeWebhookEvent count != 1 after replay "
                    "(idempotency broken)."
                )
            if (
                Payment.objects.filter(
                    order=order, status=Payment.Status.SUCCEEDED
                ).count()
                != 1
            ):
                raise StripeSmokeError(
                    "Unexpected payment rows after idempotent replay."
                )

        result = StripeFulfillSmokeResult(
            order_id=str(order.pk),
            payment_id=str(payment.pk),
            stripe_session_id=session_id,
            event_id=event_id,
            entitlement_ok=True,
            receipt_sent=True,
            replay_idempotent=True,
            cleaned_up=False,
        )
    finally:
        if session_id and session_id.startswith("cs_"):
            try:
                stripe.checkout.Session.expire(session_id)
            except stripe.error.StripeError:
                # Session may already be complete/expired; ignore.
                pass
        cleaned_up = False
        if cleanup:
            if order is not None:
                StripeWebhookEvent.objects.filter(stripe_event_id=event_id).delete()
                Payment.objects.filter(order=order).delete()
                order.delete()
            Cart.objects.filter(user=user).delete()
            Product.objects.filter(pk=product.pk).delete()
            User.objects.filter(pk=user.pk).delete()
            cleaned_up = True

    if result is None:
        raise StripeSmokeError("Sandbox smoke did not produce a result.")
    if cleaned_up:
        return StripeFulfillSmokeResult(
            order_id=result.order_id,
            payment_id=result.payment_id,
            stripe_session_id=result.stripe_session_id,
            event_id=result.event_id,
            entitlement_ok=result.entitlement_ok,
            receipt_sent=result.receipt_sent,
            replay_idempotent=result.replay_idempotent,
            cleaned_up=True,
        )
    return result
