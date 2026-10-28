"""Optional network locks for Django /admin/ and SPA console admin APIs.

SPA UI is served at /console/ (frontend). Real protection is API-side:
``/api/v1/auth/admin/`` and ``/api/v1/admin/``.
"""

from __future__ import annotations

import ipaddress

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.http import HttpResponseForbidden, HttpResponseNotFound


def is_django_admin_path(path: str) -> bool:
    normalized = path or ""
    return normalized == "/admin" or normalized.startswith("/admin/")


def is_spa_admin_api_path(path: str) -> bool:
    """Admin login/session + all /api/v1/admin/* management routes."""
    normalized = path or ""
    if normalized == "/api/v1/auth/admin" or normalized.startswith(
        "/api/v1/auth/admin/"
    ):
        return True
    return normalized == "/api/v1/admin" or normalized.startswith("/api/v1/admin/")


def parse_allowed_networks(raw) -> tuple[ipaddress._BaseNetwork, ...]:
    values: list[str]
    if isinstance(raw, (list, tuple)):
        values = [str(item).strip() for item in raw if str(item).strip()]
    else:
        values = [
            part.strip()
            for part in str(raw or "").split(",")
            if part.strip()
        ]
    networks: list[ipaddress._BaseNetwork] = []
    for value in values:
        try:
            networks.append(ipaddress.ip_network(value, strict=False))
        except ValueError as exc:
            raise ImproperlyConfigured("Administrator IP allowlist contains an invalid IP/CIDR.") from exc
    return tuple(networks)


def request_client_ip(request) -> str:
    """Single trusted client IP: X-Real-IP, else the TCP peer.

    Nginx overwrites X-Real-IP with the Cloudflare-verified visitor IP, or, on Render,
    ``config.edge.TrustedEdgeMiddleware`` sets it only after checking the Worker's secret
    (and removes a forged one otherwise). Never read CF-Connecting-IP or X-Forwarded-For
    here: clients can set those directly.
    """
    meta = getattr(request, "META", {}) or {}
    real_ip = str(meta.get("HTTP_X_REAL_IP") or "").strip()
    if real_ip:
        return real_ip
    return str(meta.get("REMOTE_ADDR") or "").strip()


def ip_is_allowed(ip: str, networks: tuple[ipaddress._BaseNetwork, ...]) -> bool:
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(address in network for network in networks)


def _client_allowed(request, networks: tuple[ipaddress._BaseNetwork, ...]) -> bool:
    if not networks:
        return True
    return ip_is_allowed(request_client_ip(request), networks)


class DjangoAdminLockMiddleware:
    """404 when Django admin disabled; 403 when allowlists exclude the client IP.

    - ``DJANGO_ADMIN_*`` applies only to ``/admin/``.
    - ``ADMIN_CONSOLE_ALLOWED_IPS`` applies to SPA console APIs
      (``/api/v1/auth/admin/`` and ``/api/v1/admin/``).
    Empty allowlists keep current open behaviour (local Compose, or
    ``ADMIN_CONSOLE_IP_LOCK_OFF`` on a deployment whose office IP keeps changing).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = getattr(request, "path", "") or ""

        if is_django_admin_path(path):
            if not bool(getattr(settings, "DJANGO_ADMIN_ENABLED", True)):
                return HttpResponseNotFound()
            networks = parse_allowed_networks(
                getattr(settings, "DJANGO_ADMIN_ALLOWED_IPS", ())
            )
            if networks and not _client_allowed(request, networks):
                return HttpResponseForbidden()
            return self.get_response(request)

        if is_spa_admin_api_path(path):
            networks = parse_allowed_networks(
                getattr(settings, "ADMIN_CONSOLE_ALLOWED_IPS", ())
            )
            if networks and not _client_allowed(request, networks):
                return HttpResponseForbidden()

        return self.get_response(request)
