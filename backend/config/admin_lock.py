"""Optional network locks for Django /admin/ and SPA console admin APIs.

SPA UI is served at /console/ (frontend). Real protection is API-side:
``/api/v1/auth/admin/`` and ``/api/v1/admin/``.
"""

from __future__ import annotations

import ipaddress

from django.conf import settings
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
        except ValueError:
            continue
    return tuple(networks)


def request_client_ips(request) -> tuple[str, ...]:
    """Prefer edge-provided visitor IP (Nginx CF map / X-Real-IP), then REMOTE_ADDR."""
    meta = getattr(request, "META", {}) or {}
    candidates: list[str] = []
    for key in ("HTTP_CF_CONNECTING_IP", "HTTP_X_REAL_IP", "REMOTE_ADDR"):
        raw = str(meta.get(key) or "").strip()
        if raw:
            candidates.append(raw.split(",")[0].strip())
    forwarded = str(meta.get("HTTP_X_FORWARDED_FOR") or "").strip()
    if forwarded:
        candidates.append(forwarded.split(",")[0].strip())
    seen: set[str] = set()
    unique: list[str] = []
    for ip in candidates:
        if ip and ip not in seen:
            seen.add(ip)
            unique.append(ip)
    return tuple(unique)


def ip_is_allowed(ip: str, networks: tuple[ipaddress._BaseNetwork, ...]) -> bool:
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(address in network for network in networks)


def _client_allowed(request, networks: tuple[ipaddress._BaseNetwork, ...]) -> bool:
    if not networks:
        return True
    client_ips = request_client_ips(request)
    return any(ip_is_allowed(ip, networks) for ip in client_ips)


class DjangoAdminLockMiddleware:
    """404 when Django admin disabled; 403 when allowlists exclude the client IP.

    - ``DJANGO_ADMIN_*`` applies only to ``/admin/``.
    - ``ADMIN_CONSOLE_ALLOWED_IPS`` applies to SPA console APIs
      (``/api/v1/auth/admin/`` and ``/api/v1/admin/``).
    Empty allowlists keep current open behaviour (local Compose).
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
