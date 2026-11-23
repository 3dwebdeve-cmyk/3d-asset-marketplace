"""Tie an administrator session to the browser that signed in.

The console keeps its access token in memory only, so a browser holding a copied refresh cookie
must refresh before it can do anything. That makes the refresh endpoint the place to check who
is asking:

- **A different browser** (Edge presenting a session that Chrome signed in, say) ends the
  session at once, for every browser holding it, and the administrator is emailed. Only the
  browser family is compared (Chrome, Edge, Firefox, Safari, ...): version updates and Chrome
  DevTools' Android device emulation keep the session, and a user agent is easy to fake, so
  comparing more would add false sign-outs rather than protection. Emulating an iPhone in
  DevTools reports Safari and does end the session; use a private window for that.
- **A different network address** only sends an email: offices, VPNs and phones change
  addresses for ordinary reasons. The new address is then remembered, so one move sends one
  email. IPv6 addresses in the same /64 network count as the same place, because devices
  rotate their own address inside it.

Customers are not covered: their sign-in keeps its existing behaviour.
"""

from __future__ import annotations

import ipaddress
import logging
import re

from django.conf import settings

from accounts import sessions
from accounts.models import User, UserSession
from accounts.security_log import log_admin_action

security_logger = logging.getLogger("accounts.security")

_VERSION = re.compile(r"\d+(?:[._]\d+)*")


# Checked in order: Edge, Opera and Samsung Internet also say "Chrome", and Chrome says "Safari".
_FAMILIES = (
    ("edge", ("edg/", "edge/", "edga/", "edgios/")),
    ("opera", ("opr/", "opera")),
    ("samsung", ("samsungbrowser/",)),
    ("firefox", ("firefox/", "fxios/")),
    ("chrome", ("chrome/", "crios/", "chromium/")),
    ("safari", ("safari/",)),
)


def browser_family(user_agent: str) -> str:
    """Which browser this is, ignoring version, operating system and device."""
    lowered = (user_agent or "").lower()
    for family, markers in _FAMILIES:
        if any(marker in lowered for marker in markers):
            return family
    # Unknown clients compare on their whole user agent, minus version numbers.
    return " ".join(_VERSION.sub("", lowered).split())


def _network(ip_address: str | None):
    try:
        address = ipaddress.ip_address(ip_address or "")
    except ValueError:
        return None
    if address.version == 6:
        return ipaddress.ip_network(f"{address}/64", strict=False)
    return address


def same_place(first: str | None, second: str | None) -> bool:
    first_network, second_network = _network(first), _network(second)
    if first_network is None or second_network is None:
        # An address we cannot read says nothing either way.
        return True
    return first_network == second_network


def check_refresh(session_id, user: User, request) -> str | None:
    """Check an active administrator session on refresh.

    Returns the session id when it was ended because a different browser asked (the refresh
    must then be refused); None when the refresh may go ahead.
    """
    from accounts.security_notices import (
        _user_agent,
        notify_admin_session_browser_changed,
        notify_admin_session_ip_changed,
    )

    session = (
        UserSession.objects.filter(pk=session_id, user=user, revoked_at__isnull=True)
        .only("pk", "user_agent", "ip_address")
        .first()
    )
    if session is None:
        return None

    user_agent = _user_agent(request)
    ip_address = sessions.client_ip(request) or ""

    if getattr(settings, "ADMIN_SESSION_BROWSER_LOCK", True):
        if session.user_agent and browser_family(session.user_agent) != browser_family(user_agent):
            # Only the request that ends the session logs and emails.
            if sessions.end_session(session.pk, reason=sessions.REASON_BROWSER_CHANGED):
                security_logger.warning(
                    "admin_session_browser_changed user_id=%s session_id=%s", user.pk, session.pk
                )
                log_admin_action(
                    action="admin_session_ended_browser_changed",
                    actor_id=str(user.pk),
                    target_id=str(session.pk),
                    metadata={
                        "signed_in_browser": session.user_agent,
                        "refresh_browser": user_agent,
                        "ip_address": ip_address,
                    },
                )
                notify_admin_session_browser_changed(
                    user,
                    signed_in_browser=session.user_agent,
                    new_browser=user_agent,
                    ip_address=ip_address,
                )
            return str(session.pk)
        if not session.user_agent and user_agent:
            # Signed in before browsers were recorded: this browser is the one from now on.
            UserSession.objects.filter(pk=session.pk, user_agent="").update(user_agent=user_agent)

    if not ip_address:
        return None
    if not session.ip_address:
        UserSession.objects.filter(pk=session.pk, ip_address__isnull=True).update(
            ip_address=ip_address
        )
        return None
    if same_place(session.ip_address, ip_address):
        return None
    # Remember the new address first; only the request that moved it sends the email.
    moved = UserSession.objects.filter(pk=session.pk, ip_address=session.ip_address).update(
        ip_address=ip_address
    )
    if moved and getattr(settings, "ADMIN_SESSION_IP_ALERTS", True):
        log_admin_action(
            action="admin_session_ip_changed",
            actor_id=str(user.pk),
            target_id=str(session.pk),
            metadata={"previous_ip_address": session.ip_address, "ip_address": ip_address},
        )
        notify_admin_session_ip_changed(
            user,
            previous_ip_address=session.ip_address,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    return None
