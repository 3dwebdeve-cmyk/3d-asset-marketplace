"""Liveness / readiness probe for orchestration (Docker, load balancers)."""

from __future__ import annotations

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from search.client import (
    get_client,
    is_configured as meili_is_configured,
    is_required as meili_is_required,
    probe_meilisearch,
)


class HealthzView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = []

    def get(self, request: Request) -> Response:
        checks: dict[str, str] = {}
        ok = True

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            checks["database"] = "ok"
        except Exception:
            checks["database"] = "error"
            ok = False

        if settings.REDIS_URL:
            try:
                probe_key = "healthz:probe"
                cache.set(probe_key, "1", timeout=5)
                if cache.get(probe_key) != "1":
                    raise RuntimeError("cache round-trip failed")
                checks["cache"] = "ok"
            except Exception:
                checks["cache"] = "error"
                ok = False
        else:
            checks["cache"] = "skipped"

        require_meili = meili_is_required()
        if require_meili or meili_is_configured():
            if not meili_is_configured():
                checks["meilisearch"] = "error"
                ok = False
            else:
                try:
                    client = get_client()
                    if client is None:
                        raise RuntimeError("meilisearch client unavailable")
                    if not probe_meilisearch(client):
                        raise RuntimeError("meilisearch health check failed")
                    checks["meilisearch"] = "ok"
                except Exception:
                    checks["meilisearch"] = "error"
                    ok = False
        else:
            checks["meilisearch"] = "skipped"

        status_code = 200 if ok else 503
        return Response(
            {"status": "ok" if ok else "unavailable", "checks": checks},
            status=status_code,
        )
