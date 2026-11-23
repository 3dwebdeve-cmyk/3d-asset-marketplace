"""End an administrator session when a rotated refresh token is used again.

Every refresh replaces the refresh cookie and blacklists the old token. A browser that sends an
old token is holding a copy of the cookie: another browser that imported it, or someone who
copied it. Refusing that one request is not enough. If the copy refreshed first, the copy holds
the session and the real administrator is the one left out. So once the grace period has
passed, the whole session ends: every browser holding it, old cookie or new, is signed out and
the administrator is told by email.

Within the grace period (ADMIN_REFRESH_REUSE_GRACE_SECONDS) a reused token is only refused.
Two tabs refreshing at the same moment both send the old cookie, and the loser of that race is
not a stolen cookie. Customers are not covered: their sign-in keeps its existing behaviour.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenBackendError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.state import token_backend
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

from accounts import sessions
from accounts.models import User
from accounts.security_log import log_admin_action
from accounts.services import AuthenticationService

security_logger = logging.getLogger("accounts.security")


def grace_seconds() -> int:
    return int(getattr(settings, "ADMIN_REFRESH_REUSE_GRACE_SECONDS", 30))


def _verified_refresh_claims(raw: str) -> dict | None:
    """Claims of a refresh token whose signature and expiry check out, else None.

    The signature matters: an unsigned token naming someone's session must not end it.
    """
    try:
        payload = token_backend.decode(raw, verify=True)
    except TokenBackendError:
        return None
    if payload.get(api_settings.TOKEN_TYPE_CLAIM) != "refresh":
        return None
    return payload


def end_session_if_reused(raw: str, request) -> str | None:
    """End the session behind a reused administrator refresh token.

    Call this only for a token the refresh endpoint refused as blacklisted. Returns the ended
    session id, or None when nothing was ended: not an administrator, still inside the grace
    period, or the session had already ended (signed out, password changed, and so on).
    """
    claims = _verified_refresh_claims(raw)
    if claims is None:
        return None
    jti = claims.get(api_settings.JTI_CLAIM)
    session_id = claims.get("sid")
    user_id = claims.get(api_settings.USER_ID_CLAIM)
    if not (jti and session_id and user_id):
        return None

    user = User.objects.filter(pk=user_id).first()
    if user is None or not AuthenticationService.is_administrator(user):
        return None

    rotated_at = (
        BlacklistedToken.objects.filter(token__jti=jti)
        .values_list("blacklisted_at", flat=True)
        .first()
    )
    if rotated_at is None or timezone.now() - rotated_at < timedelta(seconds=grace_seconds()):
        return None

    # Only the request that ends the session logs and emails, even if several arrive at once.
    if not sessions.end_session(session_id, reason=sessions.REASON_REFRESH_REUSED):
        return None

    from accounts.security_notices import _user_agent, notify_admin_session_reused

    user_agent = _user_agent(request)
    ip_address = sessions.client_ip(request) or ""
    security_logger.warning(
        "admin_refresh_reused user_id=%s session_id=%s", user.pk, session_id
    )
    log_admin_action(
        action="admin_session_ended_refresh_reused",
        actor_id=str(user.pk),
        target_id=str(session_id),
        metadata={"ip_address": ip_address, "user_agent": user_agent},
    )
    notify_admin_session_reused(user, user_agent=user_agent, ip_address=ip_address)
    return str(session_id)
