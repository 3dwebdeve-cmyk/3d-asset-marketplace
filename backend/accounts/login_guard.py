"""Account/client failed-login lockout (complements per-IP login throttles).

Only failures are counted, so a victim cannot be locked out by someone
replaying successful logins; a successful login clears the counter. The
Blocked attempts do not extend the lock. Another client cannot lock out the owner.
"""

from __future__ import annotations

from django.conf import settings
from django.core.cache import cache

from accounts.throttles import hash_email
from config.locking import advisory_lock

DEFAULT_MAX_FAILURES = 10
DEFAULT_WINDOW_SECONDS = 15 * 60


def _max_failures() -> int:
    return int(getattr(settings, "LOGIN_LOCKOUT_MAX_FAILURES", DEFAULT_MAX_FAILURES))


def _window_seconds() -> int:
    return int(getattr(settings, "LOGIN_LOCKOUT_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS))


def _key(email: str, client_ip: str = "") -> str | None:
    ident = hash_email(f"{email.strip().lower()}:{client_ip}")
    if ident is None:
        return None
    return f"login_guard:failures:{ident}"


def is_locked(email: str, client_ip: str = "") -> bool:
    key = _key(email, client_ip)
    if key is None:
        return False
    return int(cache.get(key, 0) or 0) >= _max_failures()


def record_failure(email: str, client_ip: str = "") -> None:
    key = _key(email, client_ip)
    if key is None:
        return
    # Not cache.incr(): DatabaseCache.incr re-sets with the default timeout.
    with advisory_lock(key):
        state = cache.get(key)
        failures = int(state or 0)
        if failures >= _max_failures():
            return
        cache.set(key, failures + 1, timeout=_window_seconds())


def reset(email: str, client_ip: str = "") -> None:
    key = _key(email, client_ip)
    if key is not None:
        with advisory_lock(key):
            cache.delete(key)


def retry_after_seconds() -> int:
    return _window_seconds()
