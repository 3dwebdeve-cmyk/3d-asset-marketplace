"""Phase K2 — post-rollback health + purchase + webhook idempotency gate.

Verifies the app is healthy after pointing Compose at previous immutable
image tags. Reuses Stripe webhook idempotency (``StripeWebhookEvent`` unique
insert) so a Stripe retry after rollback cannot double-entitle.

Does not reverse migrations, print secrets, or mutate host Compose state.
Operator image swap: ``scripts/rollback_compose.sh`` / ``.ps1``.
See ``docs/ROLLBACK_REHEARSAL.md``.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Literal
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.test import Client, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.legal_service import LegalAcceptanceService
from accounts.models import Role, User
from cart.models import Cart, CartItem
from categories.models import Category
from orders.entitlements import order_allows_download, user_owns_catalog_item
from orders.models import Order, OrderItem
from payments.models import Payment, StripeWebhookEvent
from payments.stripe_config import collect_stripe_config_report
from products.models import Product

RollbackProfile = Literal["local", "staging"]

SMOKE_EMAIL_PREFIX = "rollback-smoke-"
SMOKE_PRODUCT_SLUG_PREFIX = "rollback-smoke-"
SMOKE_CATEGORY_SLUG = "rollback-smoke-props"


@dataclass(frozen=True)
class RollbackCheck:
    name: str
    ok: bool
    detail: str
    blocking: bool = True


@dataclass(frozen=True)
class RollbackRehearsalResult:
    profile: RollbackProfile
    checks: tuple[RollbackCheck, ...]
    debug: bool
    warnings: tuple[str, ...] = field(default_factory=tuple)
    manual_reminders: tuple[str, ...] = field(default_factory=tuple)

    @property
    def blocking_failures(self) -> tuple[RollbackCheck, ...]:
        return tuple(c for c in self.checks if c.blocking and not c.ok)

    @property
    def all_ok(self) -> bool:
        return not self.blocking_failures


class RollbackRehearsalError(Exception):
    """Operator-facing gate failure (no secrets in message)."""


def _env_image(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def _tag_looks_mutable(image: str) -> bool:
    if not image:
        return True
    # Bare :latest or registry/...:latest — not safe for rollback.
    if image.endswith(":latest") or image == "latest":
        return True
    return False


def _check_immutable_tags(profile: RollbackProfile) -> RollbackCheck:
    web = _env_image("WEB_IMAGE")
    frontend = _env_image("FRONTEND_IMAGE")
    detail = f"WEB_IMAGE={web or '(unset)'} FRONTEND_IMAGE={frontend or '(unset)'}"
    mutable = _tag_looks_mutable(web) or _tag_looks_mutable(frontend)
    # Local Compose defaults to *:local when unset — treat unset as advisory only.
    if not web and not frontend:
        return RollbackCheck(
            name="immutable_tags",
            ok=True,
            detail=detail + " (Compose defaults *:local - set previous tags on host)",
            blocking=False,
        )
    if mutable:
        return RollbackCheck(
            name="immutable_tags",
            ok=False,
            detail=detail + " - refuse :latest-only tags for rollback",
            blocking=profile == "staging",
        )
    return RollbackCheck(name="immutable_tags", ok=True, detail=detail)


def _http_host() -> str:
    hosts = [
        h.strip()
        for h in (getattr(settings, "ALLOWED_HOSTS", None) or [])
        if h and str(h).strip() and str(h).strip() != "*"
    ]
    for candidate in ("testserver", "localhost", "127.0.0.1"):
        if candidate in hosts:
            return candidate
    return hosts[0] if hosts else "testserver"


def _check_healthz() -> RollbackCheck:
    client = Client()
    http_host = _http_host()
    try:
        response = client.get(
            reverse("healthz"),
            secure=True,
            HTTP_HOST=http_host,
        )
    except Exception as exc:  # pragma: no cover - defensive
        return RollbackCheck(
            name="healthz",
            ok=False,
            detail=f"request failed: {exc.__class__.__name__}",
        )
    content_type = (response.get("Content-Type") or "").lower()
    checks = None
    if response.status_code < 500 and "application/json" in content_type:
        try:
            body = response.json()
        except ValueError:
            body = {}
        if isinstance(body, dict):
            checks = body.get("checks")
    detail = f"status={response.status_code} host={http_host} checks={checks}"
    return RollbackCheck(
        name="healthz",
        ok=response.status_code == 200 and "application/json" in content_type,
        detail=detail,
    )


def _fake_session(session_id: str) -> MagicMock:
    session = MagicMock()
    session.id = session_id
    session.url = f"https://checkout.stripe.com/c/pay/{session_id}"
    return session


def _check_purchase_path() -> RollbackCheck:
    """Mocked Stripe Session.create — proves checkout path after image rollback."""
    token = uuid.uuid4().hex[:12]
    email = f"{SMOKE_EMAIL_PREFIX}{token}@example.com"
    product_slug = f"{SMOKE_PRODUCT_SLUG_PREFIX}{token}"
    role = Role.objects.get(role_name="Customer")
    user = User.objects.create_user(
        email=email,
        full_name="Rollback Smoke Buyer",
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
        defaults={"name": "Rollback Smoke Props"},
    )
    product = Product.objects.create(
        category=category,
        name=f"Rollback Smoke Asset {token}",
        slug=product_slug,
        price=Decimal("12.50"),
        status=Product.Status.PUBLISHED,
    )
    cart, _ = Cart.objects.get_or_create(user=user)
    CartItem.objects.create(
        cart=cart,
        product_type=CartItem.ProductType.PRODUCT,
        product_id=product.pk,
        quantity=1,
    )
    client = APIClient()
    client.force_authenticate(user=user)
    order: Order | None = None
    try:
        with override_settings(
            STRIPE_SECRET_KEY="sk_test_rollback_rehearsal_mock",
            E2E_STRIPE_SIMULATE=False,
            FRONTEND_BASE_URL=getattr(
                settings, "FRONTEND_BASE_URL", "http://localhost:8080"
            )
            or "http://localhost:8080",
            ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"],
        ), patch(
            "payments.checkout_service.stripe.checkout.Session.create",
            return_value=_fake_session(f"cs_test_rollback_{token}"),
        ):
            response = client.post(
                reverse("payments:checkout"),
                {
                    "accepted_legal": LegalAcceptanceService.current_versions(),
                },
                format="json",
            )
        if response.status_code != status.HTTP_201_CREATED:
            return RollbackCheck(
                name="purchase_path",
                ok=False,
                detail=f"checkout HTTP {response.status_code}",
            )
        order_id = response.data.get("order_id")
        checkout_url = response.data.get("checkout_url") or ""
        if not order_id or not checkout_url:
            return RollbackCheck(
                name="purchase_path",
                ok=False,
                detail="checkout missing order_id or checkout_url",
            )
        order = Order.objects.filter(pk=order_id).first()
        return RollbackCheck(
            name="purchase_path",
            ok=True,
            detail=(
                f"checkout 201 order_id={order_id} "
                f"session_mocked=True (no live charge)"
            ),
        )
    finally:
        if order is not None:
            Payment.objects.filter(order=order).delete()
            order.delete()
        Cart.objects.filter(user=user).delete()
        Product.objects.filter(pk=product.pk).delete()
        User.objects.filter(pk=user.pk).delete()


class _FakeStripeEvent:
    def __init__(self, event_id: str, event_type: str, data_object: dict[str, Any]):
        self.id = event_id
        self.type = event_type
        self.data = MagicMock()
        self.data.object = data_object


def _check_webhook_idempotency() -> RollbackCheck:
    """DB-backed idempotency survives image rollback (Postgres keeps event rows)."""
    token = uuid.uuid4().hex[:12]
    email = f"{SMOKE_EMAIL_PREFIX}wh-{token}@example.com"
    product_slug = f"{SMOKE_PRODUCT_SLUG_PREFIX}wh-{token}"
    event_id = f"evt_rollback_{token}"
    session_id = f"cs_test_rollback_wh_{token}"

    role = Role.objects.get(role_name="Customer")
    user = User.objects.create_user(
        email=email,
        full_name="Rollback Webhook Buyer",
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
        defaults={"name": "Rollback Smoke Props"},
    )
    product = Product.objects.create(
        category=category,
        name=f"Rollback Webhook Asset {token}",
        slug=product_slug,
        price=Decimal("19.99"),
        status=Product.Status.PUBLISHED,
    )
    order = Order.objects.create(
        user=user,
        invoice_number=f"INV-RB-{token.upper()}",
        total_amount=Decimal("19.99"),
        currency="USD",
    )
    OrderItem.objects.create(
        order=order,
        product_type=OrderItem.ProductType.PRODUCT,
        product_id=product.pk,
        title=product.name,
        slug=product.slug,
        quantity=1,
        purchase_price=Decimal("19.99"),
    )
    payment = Payment.objects.create(
        order=order,
        stripe_checkout_session_id=session_id,
        amount=Decimal("19.99"),
        currency="USD",
        status=Payment.Status.PENDING,
    )
    event = _FakeStripeEvent(
        event_id,
        "checkout.session.completed",
        {
            "id": session_id,
            "payment_intent": f"pi_rollback_{token}",
            "metadata": {"order_id": str(order.pk)},
        },
    )
    client = Client()
    try:
        with override_settings(
            CELERY_TASK_ALWAYS_EAGER=True,
            EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
            STRIPE_WEBHOOK_SECRET="whsec_rollback_rehearsal",
            ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"],
        ), patch(
            "payments.views.stripe.Webhook.construct_event",
            return_value=event,
        ):
            first = client.post(
                reverse("payments:webhook"),
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=rollback",
            )
            second = client.post(
                reverse("payments:webhook"),
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=1,v1=rollback",
            )

        if first.status_code != 200 or second.status_code != 200:
            return RollbackCheck(
                name="webhook_idempotency",
                ok=False,
                detail=(
                    f"webhook HTTP first={first.status_code} "
                    f"second={second.status_code}"
                ),
            )

        order.refresh_from_db()
        payment.refresh_from_db()
        event_count = StripeWebhookEvent.objects.filter(
            stripe_event_id=event_id
        ).count()
        payment_count = Payment.objects.filter(
            order=order, status=Payment.Status.SUCCEEDED
        ).count()
        entitled = order_allows_download(order) and user_owns_catalog_item(
            user,
            OrderItem.ProductType.PRODUCT,
            product.pk,
        )
        ok = (
            event_count == 1
            and payment_count == 1
            and payment.status == Payment.Status.SUCCEEDED
            and entitled
        )
        return RollbackCheck(
            name="webhook_idempotency",
            ok=ok,
            detail=(
                f"event_rows={event_count} succeeded_payments={payment_count} "
                f"entitled={entitled} replay_noop=True"
            ),
        )
    finally:
        StripeWebhookEvent.objects.filter(stripe_event_id=event_id).delete()
        Payment.objects.filter(pk=payment.pk).delete()
        order.delete()
        Cart.objects.filter(user=user).delete()
        Product.objects.filter(pk=product.pk).delete()
        User.objects.filter(pk=user.pk).delete()


def _check_sandbox_webhook_smoke() -> RollbackCheck:
    """Optional live sk_test_ Session.create + signed fulfill + replay."""
    from payments.stripe_smoke import StripeSmokeError, run_sandbox_fulfill_smoke

    report = collect_stripe_config_report(require_test_mode=True)
    if report.warnings or report.secret_mode != "test":
        return RollbackCheck(
            name="sandbox_webhook_smoke",
            ok=False,
            detail=(
                "Stripe test keys/webhook not ready for --smoke-webhook; "
                "run check_stripe_config --require-test-mode first"
            ),
            blocking=True,
        )
    try:
        result = run_sandbox_fulfill_smoke(cleanup=True)
    except StripeSmokeError as exc:
        return RollbackCheck(
            name="sandbox_webhook_smoke",
            ok=False,
            detail=str(exc),
        )
    return RollbackCheck(
        name="sandbox_webhook_smoke",
        ok=bool(result.replay_idempotent and result.entitlement_ok),
        detail=(
            f"session={result.stripe_session_id} "
            f"replay_idempotent={result.replay_idempotent} "
            f"entitlement_ok={result.entitlement_ok}"
        ),
    )


def _manual_reminders(profile: RollbackProfile) -> tuple[str, ...]:
    return (
        "Record known-good WEB_IMAGE / FRONTEND_IMAGE before deploying tag B",
        "Backup Postgres (backup_postgres.sh) before rehearsal deploy",
        "Keep previous .env / secret-manager version for last good release",
        "Roll back images only: scripts/rollback_compose.sh|.ps1 "
        "(docker compose up -d --no-deps web worker frontend)",
        "Do NOT migrate reverse on destructive changes - expand/contract "
        "or restore from pre-deploy dump (PRODUCTION_CHECKLIST section 4.2)",
        "After rollback: healthz + purchase path + webhook idempotency "
        "(this command / --smoke-webhook on staging)",
        "Date the rehearsal in docs/ROLLBACK_REHEARSAL.md sign-off table",
        *(
            (
                "Staging: use sk_test_ only; confirm Stripe Dashboard retries "
                "still hit unique StripeWebhookEvent rows",
            )
            if profile == "staging"
            else ()
        ),
    )


def run_rollback_rehearsal(
    *,
    profile: RollbackProfile = "local",
    smoke_webhook: bool = False,
) -> RollbackRehearsalResult:
    if profile not in {"local", "staging"}:
        raise RollbackRehearsalError(f"Unknown rollback profile: {profile}")

    checks: list[RollbackCheck] = [
        _check_immutable_tags(profile),
        _check_healthz(),
        _check_purchase_path(),
        _check_webhook_idempotency(),
    ]
    if smoke_webhook:
        checks.append(_check_sandbox_webhook_smoke())

    warnings: list[str] = []
    for check in checks:
        if not check.ok and not check.blocking:
            warnings.append(f"{check.name}: {check.detail}")

    if bool(settings.DEBUG) and profile == "staging":
        warnings.append(
            "DEBUG=True on staging profile - set DEBUG=False on the host "
            "before dating the rehearsal."
        )

    return RollbackRehearsalResult(
        profile=profile,
        checks=tuple(checks),
        debug=bool(settings.DEBUG),
        warnings=tuple(warnings),
        manual_reminders=_manual_reminders(profile),
    )
