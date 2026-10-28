"""HTTP Idempotency-Key helpers backed by PostgreSQL, not an evictable cache."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import hashlib
from datetime import timedelta

from django.utils import timezone

from config.locking import advisory_lock
from payments.models import IdempotencyRecord

DEFAULT_TTL_SECONDS = 24 * 60 * 60  # 24 hours


def build_cache_key(scope: str, user_id: str | int, key: str) -> str:
    return f"idempotency:{scope}:{user_id}:{key}"


def get_or_set(
    cache_key: str,
    producer: Callable[[], tuple[dict[str, Any], int]],
    *,
    ttl: int = DEFAULT_TTL_SECONDS,
) -> tuple[dict[str, Any], int]:
    """Serialize identical keys and commit the response with producer DB writes."""
    digest = hashlib.sha256(cache_key.encode()).hexdigest()
    with advisory_lock(f"idempotency:{digest}"):
        record = IdempotencyRecord.objects.filter(
            pk=digest, expires_at__gt=timezone.now(),
        ).first()
        if record is not None:
            return record.body, record.status_code
        body, status_code = producer()
        if 200 <= status_code < 300:
            IdempotencyRecord.objects.update_or_create(
                pk=digest,
                defaults={"body": body, "status_code": status_code,
                          "expires_at": timezone.now() + timedelta(seconds=ttl)},
            )
        return body, status_code


def idempotency_key_from_request(request: Any) -> str | None:
    """Read ``Idempotency-Key`` header; empty/whitespace → None."""
    raw = request.headers.get("Idempotency-Key")
    if raw is None:
        return None
    key = str(raw).strip()
    return key or None
