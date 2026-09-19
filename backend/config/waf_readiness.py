"""Phase H3 — Cloudflare WAF readiness helpers (app layer).

Verifies DRF auth throttles remain configured and that the SPA Nginx config
forwards Cloudflare's visitor IP. Does not call Cloudflare APIs and does not
print secrets. Dashboard Bot Fight / WAF enablement is operator-only — see
``docs/CLOUDFLARE_WAF_CHECKLIST.md``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from django.conf import settings

from accounts.throttles import LoginRateThrottle, RegisterRateThrottle
from accounts.views import (
    AdminLoginView,
    GoogleLoginView,
    LoginView,
    RegisterView,
)


# Auth scopes that must remain present as the DRF second layer behind Cloudflare.
REQUIRED_AUTH_THROTTLE_RATES: dict[str, str] = {
    "auth_login": "5/min",
    "auth_register": "3/min",
    "auth_password_reset": "5/hour",
    "auth_token_refresh": "20/min",
    "payment_checkout": "10/min",
}

_AUTH_VIEWS_LOGIN = (LoginView, GoogleLoginView, AdminLoginView)
_AUTH_VIEWS_REGISTER = (RegisterView,)


@dataclass(frozen=True)
class WafReadinessCheck:
    name: str
    ok: bool
    detail: str
    blocking: bool = True


@dataclass(frozen=True)
class WafReadinessResult:
    checks: tuple[WafReadinessCheck, ...]
    debug: bool
    warnings: tuple[str, ...] = field(default_factory=tuple)

    @property
    def blocking_failures(self) -> tuple[WafReadinessCheck, ...]:
        return tuple(c for c in self.checks if c.blocking and not c.ok)

    @property
    def all_ok(self) -> bool:
        return not self.blocking_failures


class WafReadinessError(Exception):
    """Operator-facing readiness failure (no secrets in message)."""


def _throttle_rates() -> dict[str, Any]:
    rf = getattr(settings, "REST_FRAMEWORK", {}) or {}
    rates = rf.get("DEFAULT_THROTTLE_RATES") or {}
    return dict(rates)


def _check_auth_throttle_rates() -> WafReadinessCheck:
    rates = _throttle_rates()
    missing: list[str] = []
    mismatched: list[str] = []
    for scope, expected in REQUIRED_AUTH_THROTTLE_RATES.items():
        actual = rates.get(scope)
        if actual is None:
            missing.append(scope)
        elif str(actual) != expected:
            mismatched.append(f"{scope}={actual!r} (expected {expected!r})")
    if missing or mismatched:
        parts: list[str] = []
        if missing:
            parts.append(f"missing={','.join(missing)}")
        if mismatched:
            parts.append(f"mismatch={';'.join(mismatched)}")
        return WafReadinessCheck(
            name="auth_throttle_rates",
            ok=False,
            detail="; ".join(parts),
        )
    return WafReadinessCheck(
        name="auth_throttle_rates",
        ok=True,
        detail=(
            f"auth_login={rates['auth_login']}, "
            f"auth_register={rates['auth_register']}, "
            f"payment_checkout={rates['payment_checkout']}"
        ),
    )


def _view_has_throttle(view_cls: type, throttle_cls: type) -> bool:
    classes = getattr(view_cls, "throttle_classes", None) or []
    return any(cls is throttle_cls for cls in classes)


def _check_auth_throttle_classes() -> WafReadinessCheck:
    problems: list[str] = []
    for view_cls in _AUTH_VIEWS_LOGIN:
        if not _view_has_throttle(view_cls, LoginRateThrottle):
            problems.append(f"{view_cls.__name__} missing LoginRateThrottle")
    for view_cls in _AUTH_VIEWS_REGISTER:
        if not _view_has_throttle(view_cls, RegisterRateThrottle):
            problems.append(f"{view_cls.__name__} missing RegisterRateThrottle")
    if problems:
        return WafReadinessCheck(
            name="auth_throttle_classes",
            ok=False,
            detail="; ".join(problems),
        )
    return WafReadinessCheck(
        name="auth_throttle_classes",
        ok=True,
        detail=(
            "Login/Google/AdminLogin use LoginRateThrottle; "
            "Register uses RegisterRateThrottle"
        ),
    )


def _check_shared_throttle_cache() -> WafReadinessCheck:
    backend = (
        (settings.CACHES.get("default") or {}).get("BACKEND") or ""
    ).lower()
    uses_redis = "redis" in backend
    if settings.DEBUG:
        return WafReadinessCheck(
            name="shared_throttle_cache",
            ok=True,
            detail=f"DEBUG=True cache_backend={backend or 'unset'} (advisory)",
            blocking=False,
        )
    if not uses_redis:
        return WafReadinessCheck(
            name="shared_throttle_cache",
            ok=False,
            detail=(
                "DEBUG=False requires Redis cache so DRF throttles share "
                "state across workers (set REDIS_URL)"
            ),
        )
    return WafReadinessCheck(
        name="shared_throttle_cache",
        ok=True,
        detail="Redis cache backend configured for shared throttles",
    )


def _nginx_conf_candidates() -> list[Path]:
    base = Path(settings.BASE_DIR)
    return [
        base.parent / "frontend" / "nginx.conf",
        base / "frontend" / "nginx.conf",
        Path("/etc/nginx/conf.d/default.conf"),
    ]


def _check_nginx_cf_client_ip() -> WafReadinessCheck:
    found: Path | None = None
    for candidate in _nginx_conf_candidates():
        if candidate.is_file():
            found = candidate
            break
    if found is None:
        return WafReadinessCheck(
            name="nginx_cf_client_ip",
            ok=True,
            detail=(
                "frontend/nginx.conf not readable in this container - "
                "verify CF-Connecting-IP map on the SPA image host"
            ),
            blocking=False,
        )
    text = found.read_text(encoding="utf-8")
    has_map = "cf_connecting_ip" in text or "CF-Connecting-IP" in text
    has_forward = "$real_client_ip" in text
    if not (has_map and has_forward):
        return WafReadinessCheck(
            name="nginx_cf_client_ip",
            ok=False,
            detail=(
                f"{found.as_posix()} missing CF-Connecting-IP → "
                "$real_client_ip proxy headers"
            ),
        )
    return WafReadinessCheck(
        name="nginx_cf_client_ip",
        ok=True,
        detail=f"{found.as_posix()} prefers CF-Connecting-IP for client IP",
    )


def _check_ssl_proxy_header() -> WafReadinessCheck:
    if settings.DEBUG:
        return WafReadinessCheck(
            name="ssl_proxy_header",
            ok=True,
            detail="DEBUG=True - SECURE_PROXY_SSL_HEADER applied when DEBUG=False",
            blocking=False,
        )
    header = getattr(settings, "SECURE_PROXY_SSL_HEADER", None)
    expected = ("HTTP_X_FORWARDED_PROTO", "https")
    if header != expected:
        return WafReadinessCheck(
            name="ssl_proxy_header",
            ok=False,
            detail=(
                f"SECURE_PROXY_SSL_HEADER={header!r} "
                f"(expected {expected!r}) for TLS at Cloudflare"
            ),
        )
    return WafReadinessCheck(
        name="ssl_proxy_header",
        ok=True,
        detail="SECURE_PROXY_SSL_HEADER trusts X-Forwarded-Proto=https",
    )


def run_waf_readiness() -> WafReadinessResult:
    """Collect app-layer WAF / bot-protection readiness checks."""
    checks = (
        _check_auth_throttle_rates(),
        _check_auth_throttle_classes(),
        _check_shared_throttle_cache(),
        _check_nginx_cf_client_ip(),
        _check_ssl_proxy_header(),
    )
    warnings: list[str] = []
    for check in checks:
        if not check.ok and not check.blocking:
            warnings.append(f"{check.name}: {check.detail}")
        elif check.ok and not check.blocking and "advisory" in check.detail.lower():
            warnings.append(f"{check.name}: {check.detail}")

    if settings.DEBUG:
        warnings.append(
            "Cloudflare dashboard Bot Fight / WAF cannot be verified from "
            "this process - enable on the public hostname and sign off in "
            "docs/CLOUDFLARE_WAF_CHECKLIST.md."
        )

    return WafReadinessResult(
        checks=checks,
        debug=bool(settings.DEBUG),
        warnings=tuple(warnings),
    )
