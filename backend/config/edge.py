"""Trust the visitor IP only when the Cloudflare Worker proves it sent the request.

On Render there is no nginx to set ``X-Real-IP``, and the Render address is public, so a
visitor could call the backend directly or forge IP headers. The Worker therefore signs
every API request with ``X-Edge-Secret`` and passes the real visitor IP as
``X-Edge-Client-IP``. This middleware checks the secret and, only then, makes that IP the
one the rest of the app sees (admin allowlist, login lockout, rate limits).

Off unless ``EDGE_SHARED_SECRET`` is set, so Docker Compose behind nginx is unchanged.
``EDGE_REQUIRE`` additionally refuses requests that did not come through the Worker.
"""

from __future__ import annotations

import hmac
import ipaddress
import logging

from django.conf import settings
from django.http import JsonResponse

logger = logging.getLogger(__name__)

# Called by Stripe or the platform directly: the webhook checks Stripe's signature itself.
EDGE_EXEMPT_PATHS = frozenset({"/api/v1/payments/webhook/", "/api/v1/healthz/"})


def _secret_matches(provided: str, expected: str) -> bool:
    return bool(provided) and hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


class TrustedEdgeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        secret = getattr(settings, "EDGE_SHARED_SECRET", "")
        if not secret:
            return self.get_response(request)

        meta = request.META
        # Remove the edge headers so nothing downstream can read or log the secret.
        provided = str(meta.pop("HTTP_X_EDGE_SECRET", "") or "")
        claimed_ip = str(meta.pop("HTTP_X_EDGE_CLIENT_IP", "") or "").strip()
        verified = _secret_matches(provided, secret)

        client_ip = ""
        if verified and claimed_ip:
            try:
                client_ip = str(ipaddress.ip_address(claimed_ip))
            except ValueError:
                logger.warning("edge_client_ip_invalid")

        if client_ip:
            # One trusted value for every reader: the admin allowlist reads X-Real-IP, and
            # DRF throttles read the last X-Forwarded-For entry (NUM_PROXIES = 1).
            meta["REMOTE_ADDR"] = client_ip
            meta["HTTP_X_REAL_IP"] = client_ip
            meta["HTTP_X_FORWARDED_FOR"] = client_ip
        else:
            # A visitor-supplied X-Real-IP is never trusted once the edge secret is in use.
            meta.pop("HTTP_X_REAL_IP", None)

        request.edge_verified = verified

        if (
            not verified
            and getattr(settings, "EDGE_REQUIRE", False)
            and request.path not in EDGE_EXEMPT_PATHS
        ):
            return JsonResponse({"detail": "Forbidden.", "code": "edge_required"}, status=403)
        return self.get_response(request)
