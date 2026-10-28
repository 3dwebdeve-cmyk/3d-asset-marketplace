"""JWT helpers that embed a per-user token version claim (`tv`) and session claims.

``auth_time`` is when the user signed in. It is copied through every refresh, so an
administrator session ends ADMIN_SESSION_MAX_HOURS after sign-in however often the
browser refreshes. ``mfa`` marks a session that passed the second factor.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken


def admin_session_max_seconds() -> int:
    return int(getattr(settings, "ADMIN_SESSION_MAX_HOURS", 8)) * 3600


def admin_session_expired(auth_time, *, now: float | None = None) -> bool:
    """True when an administrator session is past its limit, or has no sign-in time."""
    try:
        started = int(auth_time)
    except (TypeError, ValueError):
        return True
    return (time.time() if now is None else now) >= started + admin_session_max_seconds()


class VersionedRefreshToken(RefreshToken):
    """Refresh/access pair carrying ``tv`` = ``user.token_version``."""

    @classmethod
    def for_user(
        cls,
        user,
        *,
        auth_time: int | None = None,
        mfa: bool = False,
        session_id=None,
    ):
        token = super().for_user(user)
        version = int(getattr(user, "token_version", 0) or 0)
        token["tv"] = version
        token["auth_time"] = int(auth_time if auth_time is not None else time.time())
        if mfa:
            token["mfa"] = True
        if session_id is not None:
            token["sid"] = str(session_id)
        return token

    def cap_to_admin_session(self) -> None:
        """End the refresh token no later than the administrator session limit."""
        session_end = int(self["auth_time"]) + admin_session_max_seconds()
        if session_end < int(self["exp"]):
            self.set_exp(
                from_time=datetime.fromtimestamp(int(self["auth_time"]), tz=timezone.utc),
                lifetime=timedelta(seconds=admin_session_max_seconds()),
            )


def access_token_with_version(refresh: RefreshToken, *, admin: bool = False) -> str:
    """Build an access token that copies ``tv`` and the session claims from the refresh token."""
    access = refresh.access_token
    access["tv"] = int(refresh.get("tv", 0) or 0)
    if refresh.get("auth_time") is not None:
        access["auth_time"] = int(refresh["auth_time"])
    if refresh.get("mfa"):
        access["mfa"] = True
    if refresh.get("sid"):
        access["sid"] = str(refresh["sid"])
    if admin and refresh.get("auth_time") is not None:
        session_end = int(refresh["auth_time"]) + admin_session_max_seconds()
        if session_end < int(access["exp"]):
            access["exp"] = session_end
    return str(access)
