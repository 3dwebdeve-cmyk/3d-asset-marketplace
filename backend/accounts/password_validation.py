"""Reject passwords that appear in known data breaches (Have I Been Pwned).

Uses the k-anonymity range API: only the first five characters of the password's
SHA-1 hash are sent, and the match is done locally. Padding is requested so response
size does not hint at the result. If the service cannot be reached the password is
accepted (fail open) and a warning is logged, so an outage never blocks sign-ups.
"""

from __future__ import annotations

import hashlib
import logging

import requests
from django.conf import settings
from django.core.exceptions import ValidationError

logger = logging.getLogger(__name__)

RANGE_URL = "https://api.pwnedpasswords.com/range/{prefix}"
TIMEOUT_SECONDS = 3


def breach_count(password: str) -> int | None:
    """Times the password appears in breaches; None when the service is unreachable."""
    # SHA-1 is the range API's lookup format, not a password hash we store.
    digest = hashlib.sha1(password.encode("utf-8"), usedforsecurity=False).hexdigest().upper()
    prefix, suffix = digest[:5], digest[5:]
    try:
        response = requests.get(
            RANGE_URL.format(prefix=prefix),
            headers={"Add-Padding": "true", "User-Agent": "3d-asset-marketplace"},
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException:
        logger.warning("password_breach_check_unavailable")
        return None
    for line in response.text.splitlines():
        candidate, _, count = line.partition(":")
        if candidate.strip() == suffix:
            try:
                return int(count.strip())
            except ValueError:
                return None
    return 0


class BreachedPasswordValidator:
    def validate(self, password: str, user=None) -> None:
        if not getattr(settings, "PASSWORD_BREACH_CHECK", True):
            return
        count = breach_count(password)
        if count:
            raise ValidationError(
                "This password has appeared in a data breach and is not safe to use. "
                "Choose a different password.",
                code="password_breached",
            )

    def get_help_text(self) -> str:
        return "Your password must not appear in a known data breach."
