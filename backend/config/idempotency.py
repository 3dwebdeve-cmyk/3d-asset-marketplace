"""HTTP Idempotency-Key helpers backed by Django cache (Redis in prod)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from django.core.cache import cache

DEFAULT_TTL_SECONDS = 24 * 60 * 60  # 24 hours


def build_cache_key(scope: str, user_id: str | int, key: str) -> str:
    return f"idempotency:{scope}:{user_id}:{key}"


def get_or_set(
    cache_key: str,
    producer: Callable[[], tuple[dict[str, Any], int]],
    *,
    ttl: int = DEFAULT_TTL_SECONDS,
) -> tuple[dict[str, Any], int]:
    """Return a cached (body, status) or run ``producer`` and cache 2xx results.

    Non-success responses are not cached so clients can retry the same key after
    fixing validation errors. Concurrent callers may both miss; that is acceptable
    for checkout (Stripe session + order creation already has service-level reuse).
    """
    cached = cache.get(cache_key)
    if isinstance(cached, dict) and "body" in cached and "status" in cached:
        return cached["body"], int(cached["status"])

    body, status_code = producer()
    if 200 <= status_code < 300:
        cache.set(
            cache_key,
            {"body": body, "status": status_code},
            timeout=ttl,
        )
    return body, status_code


def idempotency_key_from_request(request: Any) -> str | None:
    """Read ``Idempotency-Key`` header; empty/whitespace → None."""
    raw = request.headers.get("Idempotency-Key")
    if raw is None:
        return None
    key = str(raw).strip()
    return key or None
