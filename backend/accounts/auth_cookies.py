"""httpOnly refresh-token cookie helpers for JWT auth."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.conf import settings
from django.http import HttpRequest, HttpResponse


def refresh_cookie_name() -> str:
    return getattr(settings, "JWT_REFRESH_COOKIE_NAME", "refresh_token")


def remember_cookie_name() -> str:
    return getattr(settings, "JWT_REFRESH_REMEMBER_COOKIE_NAME", "refresh_remember")


def refresh_cookie_path() -> str:
    """Path= for refresh cookies (canonical auth mount)."""
    return getattr(settings, "JWT_REFRESH_COOKIE_PATH", "/api/v1/auth/")


def refresh_cookie_samesite() -> str:
    return getattr(settings, "JWT_REFRESH_COOKIE_SAMESITE", "Lax")


def refresh_cookie_secure() -> bool:
    """Secure cookies in production; allow HTTP locally when DEBUG is on."""
    configured = getattr(settings, "JWT_REFRESH_COOKIE_SECURE", None)
    if configured is not None:
        return bool(configured)
    return not settings.DEBUG


def refresh_cookie_max_age(*, remember: bool) -> int | None:
    if not remember:
        return None
    lifetime = settings.SIMPLE_JWT.get("REFRESH_TOKEN_LIFETIME", timedelta(days=7))
    if isinstance(lifetime, timedelta):
        return int(lifetime.total_seconds())
    return int(lifetime)


def get_refresh_from_request(request: HttpRequest) -> str | None:
    raw = request.COOKIES.get(refresh_cookie_name(), "")
    token = raw.strip() if isinstance(raw, str) else ""
    return token or None


def get_remember_from_request(request: HttpRequest) -> bool:
    return request.COOKIES.get(remember_cookie_name()) == "1"


def set_refresh_cookie(
    response: HttpResponse,
    token: str,
    *,
    remember: bool,
) -> None:
    common: dict[str, Any] = {
        "httponly": True,
        "secure": refresh_cookie_secure(),
        "samesite": refresh_cookie_samesite(),
        "path": refresh_cookie_path(),
    }
    max_age = refresh_cookie_max_age(remember=remember)
    if max_age is not None:
        common["max_age"] = max_age

    response.set_cookie(refresh_cookie_name(), token, **common)

    if remember:
        response.set_cookie(remember_cookie_name(), "1", **common)
    else:
        response.delete_cookie(
            remember_cookie_name(),
            path=refresh_cookie_path(),
            samesite=refresh_cookie_samesite(),
        )


def clear_refresh_cookie(response: HttpResponse) -> None:
    """Clear refresh cookies on current + legacy paths (one-release dual clear)."""
    samesite = refresh_cookie_samesite()
    paths = {
        refresh_cookie_path(),
        "/api/v1/auth/",
        "/api/auth/",
        "/api/",
    }
    for path in paths:
        response.delete_cookie(refresh_cookie_name(), path=path, samesite=samesite)
        response.delete_cookie(remember_cookie_name(), path=path, samesite=samesite)
