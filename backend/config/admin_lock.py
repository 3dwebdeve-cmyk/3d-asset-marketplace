"""Optional Django-admin lock (SPA console is /console/; APIs stay /api/v1/admin/)."""

from __future__ import annotations

import ipaddress

from django.conf import settings
from django.http import HttpResponseForbidden, HttpResponseNotFound


def is_django_admin_path(path: str) -> bool:
    normalized = path or ""
    return normalized == "/admin" or normalized.startswith("/admin/")


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


class DjangoAdminLockMiddleware:
    """404 when disabled; 403 when allowlist is set and the client IP is not in it.

    Empty ``DJANGO_ADMIN_ALLOWED_IPS`` keeps current behaviour (login redirect).
    Does not touch ``/api/v1/admin/`` or ``/console/``.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = getattr(request, "path", "") or ""
        if not is_django_admin_path(path):
            return self.get_response(request)

        if not bool(getattr(settings, "DJANGO_ADMIN_ENABLED", True)):
            return HttpResponseNotFound()

        networks = parse_allowed_networks(
            getattr(settings, "DJANGO_ADMIN_ALLOWED_IPS", ())
        )
        if not networks:
            return self.get_response(request)

        client_ips = request_client_ips(request)
        if any(ip_is_allowed(ip, networks) for ip in client_ips):
            return self.get_response(request)
        return HttpResponseForbidden()
