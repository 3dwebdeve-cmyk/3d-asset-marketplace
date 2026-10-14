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
# Per-account ceiling across all client IPs. Set well above the per-IP limit so a
# distributed guesser is bounded, while one attacker still cannot lock out the owner
# quickly.
DEFAULT_ACCOUNT_MAX_FAILURES = 50


def _max_failures() -> int:
    return int(getattr(settings, "LOGIN_LOCKOUT_MAX_FAILURES", DEFAULT_MAX_FAILURES))


def _window_seconds() -> int:
    return int(getattr(settings, "LOGIN_LOCKOUT_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS))


def _account_max_failures() -> int:
    return int(
        getattr(settings, "LOGIN_LOCKOUT_ACCOUNT_MAX_FAILURES", DEFAULT_ACCOUNT_MAX_FAILURES)
    )


def _key(email: str, client_ip: str = "") -> str | None:
    ident = hash_email(f"{email.strip().lower()}:{client_ip}")
    if ident is None:
        return None
    return f"login_guard:failures:{ident}"


def _account_key(email: str) -> str | None:
    ident = hash_email(email.strip().lower())
    if ident is None:
        return None
    return f"login_guard:account:{ident}"


def is_locked(email: str, client_ip: str = "") -> bool:
    key = _key(email, client_ip)
    if key is None:
        return False
    if int(cache.get(key, 0) or 0) >= _max_failures():
        return True
    account_key = _account_key(email)
    return account_key is not None and (
        int(cache.get(account_key, 0) or 0) >= _account_max_failures()
    )


def _bump(key: str, limit: int) -> None:
    # Not cache.incr(): DatabaseCache.incr re-sets with the default timeout.
    with advisory_lock(key):
        failures = int(cache.get(key) or 0)
        if failures >= limit:
            return
        cache.set(key, failures + 1, timeout=_window_seconds())


def record_failure(email: str, client_ip: str = "") -> None:
    key = _key(email, client_ip)
    if key is not None:
        _bump(key, _max_failures())
    account_key = _account_key(email)
    if account_key is not None:
        _bump(account_key, _account_max_failures())


def reset(email: str, client_ip: str = "") -> None:
    # A successful login proves the owner is present, so clear both counters.
    for key in (_key(email, client_ip), _account_key(email)):
        if key is not None:
            with advisory_lock(key):
                cache.delete(key)


def retry_after_seconds() -> int:
    return _window_seconds()
