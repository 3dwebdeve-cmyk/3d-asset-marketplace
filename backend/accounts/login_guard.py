"""Per-account failed-login lockout (complements per-IP login throttles).

Only failures are counted, so a victim cannot be locked out by someone
replaying successful logins; a successful login clears the counter. The
window slides: the lock lasts until no failure has been seen for the window.
"""

from __future__ import annotations

from django.conf import settings
from django.core.cache import cache

from accounts.throttles import hash_email

DEFAULT_MAX_FAILURES = 10
DEFAULT_WINDOW_SECONDS = 15 * 60


def _max_failures() -> int:
    return int(getattr(settings, "LOGIN_LOCKOUT_MAX_FAILURES", DEFAULT_MAX_FAILURES))


def _window_seconds() -> int:
    return int(getattr(settings, "LOGIN_LOCKOUT_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS))


def _key(email: str) -> str | None:
    ident = hash_email(email)
    if ident is None:
        return None
    return f"login_guard:failures:{ident}"


def is_locked(email: str) -> bool:
    key = _key(email)
    if key is None:
        return False
    return int(cache.get(key, 0) or 0) >= _max_failures()


def record_failure(email: str) -> None:
    key = _key(email)
    if key is None:
        return
    # Not cache.incr(): DatabaseCache.incr re-sets with the default timeout.
    failures = int(cache.get(key, 0) or 0) + 1
    cache.set(key, failures, timeout=_window_seconds())


def reset(email: str) -> None:
    key = _key(email)
    if key is not None:
        cache.delete(key)


def retry_after_seconds() -> int:
    return _window_seconds()
