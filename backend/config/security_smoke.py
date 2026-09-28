"""Phase H2 — formal security smoke helpers (no secrets printed).

Exercises the controls listed in ``docs/SECURITY_SMOKE_CHECKLIST.md`` via the
Django / DRF test clients and settings inspection. Intended for local +
staging/prod operator runs; does not replace edge HTTPS verification on a
real host.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import patch

from django.conf import settings
from django.core import checks as django_checks
from django.core.cache import cache
from django.test import Client, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.throttles import LoginRateThrottle
from config.deploy_checks import collect_deploy_config_report
from config.media import is_public_media_path
from payments.models import Payment, StripeWebhookEvent


@dataclass(frozen=True)
class SecuritySmokeCheck:
    name: str
    ok: bool
    detail: str
    blocking: bool = True


@dataclass(frozen=True)
class SecuritySmokeResult:
    checks: tuple[SecuritySmokeCheck, ...]
    debug: bool
    warnings: tuple[str, ...] = field(default_factory=tuple)

    @property
    def blocking_failures(self) -> tuple[SecuritySmokeCheck, ...]:
        return tuple(c for c in self.checks if c.blocking and not c.ok)

    @property
    def all_ok(self) -> bool:
        return not self.blocking_failures


class SecuritySmokeError(Exception):
    """Operator-facing smoke failure (no secrets in message)."""


def _cookie_secure_expected() -> bool:
    """When DEBUG=False, SESSION/CSRF cookies must be Secure."""
    if settings.DEBUG:
        return True
    return bool(getattr(settings, "SESSION_COOKIE_SECURE", False)) and bool(
        getattr(settings, "CSRF_COOKIE_SECURE", False)
    )


def _cors_csrf_allowlist_ok() -> tuple[bool, str]:
    cors = [
        o.strip()
        for o in (getattr(settings, "CORS_ALLOWED_ORIGINS", None) or [])
        if o and str(o).strip()
    ]
    if any(o == "*" for o in cors):
        return False, "CORS_ALLOWED_ORIGINS contains wildcard *"
    if getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False):
        return False, "CORS_ALLOW_ALL_ORIGINS is True"

    csrf = [
        o.strip()
        for o in (getattr(settings, "CSRF_TRUSTED_ORIGINS", None) or [])
        if o and str(o).strip()
    ]
    if not settings.DEBUG and not csrf:
        return False, "CSRF_TRUSTED_ORIGINS empty while DEBUG=False"
    if any("*" in o for o in csrf):
        return False, "CSRF_TRUSTED_ORIGINS contains wildcard"

    return True, f"cors={len(cors)} csrf={len(csrf)}"


def _check_deploy_hygiene(*, run_django_deploy: bool) -> SecuritySmokeCheck:
    report = collect_deploy_config_report()
    parts = [
        f"DEBUG={report.debug}",
        f"SECURE_SSL_REDIRECT={report.secure_ssl_redirect}",
        f"SECURE_HSTS_SECONDS={report.secure_hsts_seconds}",
        f"SESSION_COOKIE_SECURE={getattr(settings, 'SESSION_COOKIE_SECURE', False)}",
        f"CSRF_COOKIE_SECURE={getattr(settings, 'CSRF_COOKIE_SECURE', False)}",
    ]

    if run_django_deploy:
        issues = django_checks.run_checks(include_deployment_checks=True)
        if issues:
            # Local DEBUG=True always fails many deploy checks — report, non-blocking.
            detail = (
                f"{'; '.join(parts)}; check --deploy issues={len(issues)} "
                "(expected when DEBUG=True; re-run on host with DEBUG=False)"
            )
            return SecuritySmokeCheck(
                name="deploy_hygiene",
                ok=settings.DEBUG,
                detail=detail,
                blocking=not settings.DEBUG,
            )
        parts.append("check --deploy=clean")

    cookies_ok = _cookie_secure_expected()
    if not cookies_ok:
        return SecuritySmokeCheck(
            name="deploy_hygiene",
            ok=False,
            detail="; ".join(parts) + "; Secure cookies missing",
            blocking=True,
        )

    ok = True
    if not settings.DEBUG:
        ok = len(report.warnings) == 0
        if report.warnings:
            parts.append(f"deploy_warnings={len(report.warnings)}")

    return SecuritySmokeCheck(
        name="deploy_hygiene",
        ok=ok,
        detail="; ".join(parts),
        blocking=not settings.DEBUG,
    )


def _check_login_throttle(client: APIClient) -> SecuritySmokeCheck:
    # Delete only the test client's counter: the cache is shared with live traffic.
    cache.delete(
        LoginRateThrottle.cache_format
        % {"scope": LoginRateThrottle.scope, "ident": "127.0.0.1"}
    )
    login_url = reverse("accounts:login")
    payload = {
        "email": f"security-smoke-{uuid.uuid4().hex[:8]}@example.com",
        "password": "WrongPassword1!",
    }
    with patch.object(LoginRateThrottle, "rate", "1/min", create=True):
        first = client.post(login_url, payload, format="json")
        second = client.post(login_url, payload, format="json")

    if first.status_code not in {400, 401}:
        return SecuritySmokeCheck(
            name="login_throttle",
            ok=False,
            detail=f"first login status={first.status_code} (expected 400/401)",
        )
    if second.status_code != 429:
        return SecuritySmokeCheck(
            name="login_throttle",
            ok=False,
            detail=f"second login status={second.status_code} (expected 429)",
        )
    body: Any = {}
    try:
        body = second.json()
    except ValueError:
        body = {}
    code = body.get("code") if isinstance(body, dict) else None
    if code != "throttled":
        return SecuritySmokeCheck(
            name="login_throttle",
            ok=False,
            detail=f"429 without code=throttled (got {code!r})",
        )
    return SecuritySmokeCheck(
        name="login_throttle",
        ok=True,
        detail="wrong password -> 401 then 429 code=throttled",
    )


def _check_unauth_download(client: APIClient) -> SecuritySmokeCheck:
    fake_product = uuid.uuid4()
    fake_file = uuid.uuid4()
    url = reverse(
        "downloads:product-file-download",
        kwargs={"product_id": fake_product, "file_id": fake_file},
    )
    response = client.get(url)
    if response.status_code != 401:
        return SecuritySmokeCheck(
            name="unauth_download",
            ok=False,
            detail=f"status={response.status_code} (expected 401)",
        )
    return SecuritySmokeCheck(
        name="unauth_download",
        ok=True,
        detail="GET product download without JWT -> 401",
    )


def _check_unsigned_private_object(client: Client) -> SecuritySmokeCheck:
    private_key = f"products/files/{uuid.uuid4().hex}/package.zip"
    if is_public_media_path(private_key):
        return SecuritySmokeCheck(
            name="unsigned_private_object",
            ok=False,
            detail="products/files/… classified as public media",
        )

    # DEBUG media handler must 404 private prefixes; when DEBUG=False Django
    # does not mount /media/ at all (edge/R2 must deny unsigned GETs).
    response = client.get(f"/media/{private_key}")
    if response.status_code not in {404, 301, 302}:
        return SecuritySmokeCheck(
            name="unsigned_private_object",
            ok=False,
            detail=f"/media/private status={response.status_code} (expected 404)",
        )
    if settings.DEBUG:
        detail = "is_public_media_path=False; DEBUG /media/ private -> 404"
    else:
        detail = "is_public_media_path=False; /media/ not serving private packages"

    return SecuritySmokeCheck(
        name="unsigned_private_object",
        ok=True,
        detail=detail,
    )


def _check_bad_webhook(client: APIClient) -> SecuritySmokeCheck:
    url = reverse("payments:webhook")
    events_before = StripeWebhookEvent.objects.count()
    payments_before = Payment.objects.count()

    if not (getattr(settings, "STRIPE_WEBHOOK_SECRET", "") or "").strip():
        response = client.post(
            url,
            data=b'{"id":"evt_security_smoke_bad"}',
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="t=1,v1=deadbeef",
        )
        if response.status_code != 503:
            return SecuritySmokeCheck(
                name="bad_webhook_signature",
                ok=False,
                detail=(
                    f"STRIPE_WEBHOOK_SECRET unset; status={response.status_code} "
                    "(expected 503)"
                ),
                blocking=False,
            )
        if (
            StripeWebhookEvent.objects.count() != events_before
            or Payment.objects.count() != payments_before
        ):
            return SecuritySmokeCheck(
                name="bad_webhook_signature",
                ok=False,
                detail="webhook mutated events/payments despite missing secret",
            )
        return SecuritySmokeCheck(
            name="bad_webhook_signature",
            ok=True,
            detail="secret unset -> 503; no fulfill",
            blocking=False,
        )

    response = client.post(
        url,
        data=b'{"id":"evt_security_smoke_bad","type":"checkout.session.completed"}',
        content_type="application/json",
        HTTP_STRIPE_SIGNATURE="t=1,v1=deadbeef",
    )
    if response.status_code != 400:
        return SecuritySmokeCheck(
            name="bad_webhook_signature",
            ok=False,
            detail=f"status={response.status_code} (expected 400)",
        )
    if (
        StripeWebhookEvent.objects.count() != events_before
        or Payment.objects.count() != payments_before
    ):
        return SecuritySmokeCheck(
            name="bad_webhook_signature",
            ok=False,
            detail="bad signature still created webhook event or payment",
        )
    return SecuritySmokeCheck(
        name="bad_webhook_signature",
        ok=True,
        detail="bad Stripe-Signature -> 400; no fulfill",
    )


def _check_cors_csrf() -> SecuritySmokeCheck:
    ok, detail = _cors_csrf_allowlist_ok()
    return SecuritySmokeCheck(
        name="cors_csrf_allowlist",
        ok=ok,
        detail=detail,
        blocking=True,
    )


def _check_django_admin(client: Client) -> SecuritySmokeCheck:
    response = client.get("/admin/", follow=False)
    enabled = bool(getattr(settings, "DJANGO_ADMIN_ENABLED", True))
    if not enabled:
        if response.status_code != 404:
            return SecuritySmokeCheck(
                name="django_admin_locked",
                ok=False,
                detail=(
                    f"DJANGO_ADMIN_ENABLED=False but /admin/ "
                    f"status={response.status_code} (expected 404)"
                ),
            )
        return SecuritySmokeCheck(
            name="django_admin_locked",
            ok=True,
            detail="DJANGO_ADMIN_ENABLED=False -> 404",
        )
    if response.status_code == 200:
        return SecuritySmokeCheck(
            name="django_admin_locked",
            ok=False,
            detail="/admin/ returned 200 without auth",
        )
    if response.status_code == 403:
        return SecuritySmokeCheck(
            name="django_admin_locked",
            ok=True,
            detail="unauthenticated /admin/ -> 403 allowlist",
        )
    if response.status_code not in {301, 302}:
        return SecuritySmokeCheck(
            name="django_admin_locked",
            ok=False,
            detail=f"/admin/ status={response.status_code} (expected redirect)",
        )
    location = response.get("Location", "")
    if "login" not in location.lower():
        return SecuritySmokeCheck(
            name="django_admin_locked",
            ok=False,
            detail=f"/admin/ redirect Location={location!r} (expected login)",
        )
    return SecuritySmokeCheck(
        name="django_admin_locked",
        ok=True,
        detail=f"unauthenticated /admin/ -> {response.status_code} login",
    )


def _check_openapi_gated(client: APIClient) -> SecuritySmokeCheck:
    response = client.get(reverse("schema"), {"format": "json"})
    if settings.DEBUG:
        if response.status_code != 200:
            return SecuritySmokeCheck(
                name="openapi_gated",
                ok=False,
                detail=f"DEBUG schema status={response.status_code} (expected 200)",
            )
        return SecuritySmokeCheck(
            name="openapi_gated",
            ok=True,
            detail="DEBUG schema public 200",
        )
    if response.status_code not in {401, 403}:
        return SecuritySmokeCheck(
            name="openapi_gated",
            ok=False,
            detail=(
                f"DEBUG=False schema status={response.status_code} "
                "(expected 401/403 for anonymous)"
            ),
        )
    return SecuritySmokeCheck(
        name="openapi_gated",
        ok=True,
        detail=f"DEBUG=False anonymous schema -> {response.status_code}",
    )


def run_security_smoke(*, django_deploy_check: bool = True) -> SecuritySmokeResult:
    """Run Phase H2 security smoke checks in-process (no secrets printed)."""
    # Same pattern as payments.stripe_smoke — Client host is "testserver".
    hosts = list(getattr(settings, "ALLOWED_HOSTS", []) or [])
    for host in ("testserver", "localhost", "127.0.0.1"):
        if host not in hosts:
            hosts.append(host)

    with override_settings(ALLOWED_HOSTS=hosts):
        api = APIClient()
        browser = Client()
        checks = (
            _check_deploy_hygiene(run_django_deploy=django_deploy_check),
            _check_login_throttle(api),
            _check_unauth_download(api),
            _check_unsigned_private_object(browser),
            _check_bad_webhook(api),
            _check_cors_csrf(),
            _check_django_admin(browser),
            _check_openapi_gated(api),
        )

    warnings: list[str] = []
    if settings.DEBUG:
        warnings.append(
            "DEBUG=True - re-run on staging/prod with DEBUG=False, HTTPS, "
            "and Secure cookies; record date/initials in PRODUCTION_CHECKLIST.md."
        )
    for check in checks:
        if not check.ok and not check.blocking:
            warnings.append(f"{check.name}: {check.detail}")

    return SecuritySmokeResult(
        checks=checks,
        debug=bool(settings.DEBUG),
        warnings=tuple(warnings),
    )
