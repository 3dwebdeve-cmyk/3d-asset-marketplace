"""Stripe sandbox / staging readiness helpers (Phase B1).

Never log or return full secret values — only mode labels and presence flags.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from django.conf import settings

from payments.webhook_service import STRIPE_WEBHOOK_EVENT_TYPES

KeyMode = Literal["empty", "test", "live", "unknown"]

WEBHOOK_PATH = "/api/v1/payments/webhook/"


def classify_secret_key(value: str) -> KeyMode:
    raw = (value or "").strip()
    if not raw:
        return "empty"
    if raw.startswith("sk_test_"):
        return "test"
    if raw.startswith("sk_live_"):
        return "live"
    return "unknown"


def classify_publishable_key(value: str) -> KeyMode:
    raw = (value or "").strip()
    if not raw:
        return "empty"
    if raw.startswith("pk_test_"):
        return "test"
    if raw.startswith("pk_live_"):
        return "live"
    return "unknown"


def webhook_secret_looks_valid(value: str) -> bool:
    raw = (value or "").strip()
    return raw.startswith("whsec_") and len(raw) > len("whsec_")


@dataclass(frozen=True)
class StripeConfigReport:
    debug: bool
    payment_mode: str
    secret_mode: KeyMode
    publishable_mode: KeyMode
    webhook_secret_set: bool
    webhook_secret_looks_valid: bool
    e2e_simulate: bool
    webhook_path: str
    event_types: tuple[str, ...]
    warnings: list[str] = field(default_factory=list)


def collect_stripe_config_report(
    *,
    require_test_mode: bool = False,
    require_live_mode: bool = False,
) -> StripeConfigReport:
    if require_test_mode and require_live_mode:
        raise ValueError(
            "require_test_mode and require_live_mode are mutually exclusive"
        )

    secret = (getattr(settings, "STRIPE_SECRET_KEY", "") or "").strip()
    publishable = (getattr(settings, "STRIPE_PUBLISHABLE_KEY", "") or "").strip()
    webhook = (getattr(settings, "STRIPE_WEBHOOK_SECRET", "") or "").strip()
    e2e = bool(getattr(settings, "E2E_STRIPE_SIMULATE", False))
    debug = bool(settings.DEBUG)
    payment_mode = getattr(settings, "STRIPE_PAYMENT_MODE", "test")

    secret_mode = classify_secret_key(secret)
    publishable_mode = classify_publishable_key(publishable)
    webhook_ok = webhook_secret_looks_valid(webhook)
    warnings: list[str] = []

    if secret_mode == "empty" and not e2e:
        if debug:
            # Local browse-without-checkout is intentional.
            pass
        else:
            warnings.append(
                "STRIPE_SECRET_KEY is empty while DEBUG=False - "
                "checkout will refuse payments."
            )
    elif secret_mode == "unknown":
        warnings.append(
            "STRIPE_SECRET_KEY does not look like sk_test_... or sk_live_...."
        )

    if publishable_mode == "empty" and secret_mode != "empty":
        warnings.append(
            "STRIPE_PUBLISHABLE_KEY is empty while STRIPE_SECRET_KEY is set."
        )
    elif publishable_mode == "unknown":
        warnings.append(
            "STRIPE_PUBLISHABLE_KEY does not look like pk_test_... or pk_live_...."
        )
    elif (
        secret_mode in {"test", "live"}
        and publishable_mode in {"test", "live"}
        and secret_mode != publishable_mode
    ):
        warnings.append(
            "STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY modes do not match "
            f"(secret={secret_mode}, publishable={publishable_mode})."
        )

    if not webhook:
        if e2e and secret_mode in {"empty", "test"}:
            # CI simulate path does not need a real webhook secret.
            pass
        elif debug and secret_mode == "empty":
            pass
        else:
            warnings.append(
                "STRIPE_WEBHOOK_SECRET is empty - "
                f"POST {WEBHOOK_PATH} returns 503 until set."
            )
    elif not webhook_ok:
        warnings.append(
            "STRIPE_WEBHOOK_SECRET should start with whsec_ "
            "(Stripe CLI or Dashboard signing secret)."
        )

    if e2e and secret_mode == "live":
        warnings.append(
            "E2E_STRIPE_SIMULATE cannot be used with live Stripe keys "
            "(settings refuse sk_live_)."
        )
    elif e2e and secret_mode not in {"empty", "test"}:
        warnings.append(
            "E2E_STRIPE_SIMULATE requires an empty or sk_test_ STRIPE_SECRET_KEY."
        )

    if require_test_mode:
        if secret_mode == "live" or publishable_mode == "live":
            warnings.append(
                "Live Stripe keys present while --require-test-mode is set. "
                "Sandbox phase uses sk_test_ / pk_test_ only (live = Phase K)."
            )
        if secret_mode == "empty" and not e2e:
            warnings.append(
                "STRIPE_SECRET_KEY empty while --require-test-mode - "
                "set sk_test_... for sandbox checkout "
                "(see docs/STRIPE_SANDBOX_CHECKLIST.md)."
            )
        if not webhook and not e2e:
            warnings.append(
                "STRIPE_WEBHOOK_SECRET empty while --require-test-mode - "
                "run Stripe CLI listen or set Dashboard test webhook secret."
            )

    if require_live_mode:
        if payment_mode != "live":
            # Checkout refuses every payment when the key and this mode disagree.
            warnings.append(
                "STRIPE_PAYMENT_MODE must be live for production cutover "
                f"(currently {payment_mode})."
            )
        if secret_mode != "live":
            warnings.append(
                "STRIPE_SECRET_KEY must be sk_live_... for production cutover "
                "(see docs/CUTOVER_STAGING_CHECKLIST.md / Phase K)."
            )
        if publishable_mode != "live":
            warnings.append(
                "STRIPE_PUBLISHABLE_KEY must be pk_live_... for production cutover."
            )
        if not webhook_ok:
            warnings.append(
                "STRIPE_WEBHOOK_SECRET must be a live endpoint whsec_ for production."
            )
        if e2e:
            warnings.append(
                "E2E_STRIPE_SIMULATE must be False/unset with live Stripe keys."
            )

    return StripeConfigReport(
        debug=debug,
        payment_mode=payment_mode,
        secret_mode=secret_mode,
        publishable_mode=publishable_mode,
        webhook_secret_set=bool(webhook),
        webhook_secret_looks_valid=webhook_ok if webhook else False,
        e2e_simulate=e2e,
        webhook_path=WEBHOOK_PATH,
        event_types=tuple(sorted(STRIPE_WEBHOOK_EVENT_TYPES)),
        warnings=warnings,
    )


def ping_stripe_api() -> str:
    """Lightweight authenticated call; raises on Stripe/network errors."""
    from payments.payment_common import stripe

    # Re-bind in case settings changed after import-time api_key assignment.
    stripe.api_key = settings.STRIPE_SECRET_KEY
    balance = stripe.Balance.retrieve()
    livemode = bool(getattr(balance, "livemode", False))
    return "live" if livemode else "test"
