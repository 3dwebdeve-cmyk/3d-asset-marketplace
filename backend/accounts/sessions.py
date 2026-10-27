"""Per-device customer sessions with a device limit.

Each customer sign-in creates a ``UserSession`` whose id rides on the JWTs as ``sid``.
Signing in on a new device past ``MAX_CUSTOMER_SESSIONS`` ends the least recently used
session. Access and refresh both check the session, so an ended device stops at once.
Administrator sign-ins get no session and are never limited.
"""

from __future__ import annotations

from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.http import HttpRequest
from django.utils import timezone

from accounts.models import User, UserSession

REASON_LOGOUT = "logout"
REASON_REPLACED = "replaced"
REASON_SIGNED_OUT_EVERYWHERE = "signed_out_everywhere"


def max_sessions() -> int:
    return max(1, int(getattr(settings, "MAX_CUSTOMER_SESSIONS", 2)))


def _client_ip(request: HttpRequest | None) -> str | None:
    if request is None:
        return None
    from accounts.throttles import LoginRateThrottle

    return LoginRateThrottle().get_ident(request) or None


@transaction.atomic
def start_session(user: User, request: HttpRequest | None = None) -> UserSession:
    """Open a session for this device and end the oldest ones past the limit."""
    from accounts.security_notices import device_hash_for_request, _user_agent

    # Serialise sign-ins for one account so two at once cannot both slip under the limit.
    User.objects.select_for_update().only("pk").get(pk=user.pk)
    now = timezone.now()
    device_hash = device_hash_for_request(request) if request is not None else ""
    active = UserSession.objects.filter(user=user, revoked_at__isnull=True)
    if device_hash:
        # Signing in again on the same browser replaces its own session, not another device.
        active.filter(device_hash=device_hash).update(
            revoked_at=now, revoked_reason=REASON_REPLACED
        )

    session = UserSession.objects.create(
        user=user,
        device_hash=device_hash,
        user_agent=_user_agent(request) if request is not None else "",
        ip_address=_client_ip(request),
    )
    stale = list(
        active.exclude(pk=session.pk)
        .order_by("-last_used_at", "-created_at")
        .values_list("pk", flat=True)[max_sessions() - 1 :]
    )
    if stale:
        UserSession.objects.filter(pk__in=stale).update(
            revoked_at=now, revoked_reason=REASON_REPLACED
        )
    return session


def _parse(session_id) -> UUID | None:
    try:
        return UUID(str(session_id))
    except (TypeError, ValueError):
        return None


def is_active(session_id, user: User) -> bool:
    sid = _parse(session_id)
    if sid is None:
        return False
    return UserSession.objects.filter(pk=sid, user=user, revoked_at__isnull=True).exists()


def revoked_reason(session_id) -> str:
    sid = _parse(session_id)
    if sid is None:
        return ""
    return (
        UserSession.objects.filter(pk=sid).values_list("revoked_reason", flat=True).first()
        or ""
    )


def touch(session_id) -> None:
    sid = _parse(session_id)
    if sid is not None:
        UserSession.objects.filter(pk=sid, revoked_at__isnull=True).update(
            last_used_at=timezone.now()
        )


def end_session(session_id, *, reason: str = REASON_LOGOUT) -> None:
    sid = _parse(session_id)
    if sid is not None:
        UserSession.objects.filter(pk=sid, revoked_at__isnull=True).update(
            revoked_at=timezone.now(), revoked_reason=reason
        )


def end_all_sessions(user: User, *, reason: str = REASON_SIGNED_OUT_EVERYWHERE) -> None:
    UserSession.objects.filter(user=user, revoked_at__isnull=True).update(
        revoked_at=timezone.now(), revoked_reason=reason
    )
