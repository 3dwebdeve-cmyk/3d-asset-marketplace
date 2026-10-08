"""Low-volume, privacy-preserving browser security telemetry."""

from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.throttles import CspReportRateThrottle

logger = logging.getLogger("security.csp")


def _safe_value(value: object, *, limit: int = 512) -> str:
    """Avoid browser-provided reports forging multi-line log entries."""
    return str(value or "").replace("\r", " ").replace("\n", " ")[:limit]


class CspReportView(APIView):
    """Accept CSP violations without retaining request bodies or user identity."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [CspReportRateThrottle]

    def post(self, request) -> Response:
        report = request.data.get("csp-report", request.data)
        if isinstance(report, dict):
            logger.warning(
                "csp_violation document=%s blocked=%s directive=%s",
                _safe_value(report.get("document-uri")),
                _safe_value(report.get("blocked-uri")),
                _safe_value(report.get("violated-directive")),
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
