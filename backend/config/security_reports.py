"""Low-volume, privacy-preserving browser security telemetry."""

from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.throttles import CspReportRateThrottle

logger = logging.getLogger("security.csp")

# A real report is a few hundred bytes. The endpoint is open to anyone, so refuse big bodies
# before they are parsed.
MAX_REPORT_BYTES = 16 * 1024
# One request may carry several reports (Reporting API); log only the first few.
MAX_REPORTS_PER_REQUEST = 10


class CspReportParser(JSONParser):
    """Browsers send CSP ``report-uri`` reports as ``application/csp-report`` (JSON)."""

    media_type = "application/csp-report"


class ReportsJsonParser(JSONParser):
    """The Reporting API sends a JSON list as ``application/reports+json``."""

    media_type = "application/reports+json"


def _safe_value(value: object, *, limit: int = 512) -> str:
    """Avoid browser-provided reports forging multi-line log entries."""
    return str(value or "").replace("\r", " ").replace("\n", " ")[:limit]


def _log_violation(document: object, blocked: object, directive: object) -> None:
    logger.warning(
        "csp_violation document=%s blocked=%s directive=%s",
        _safe_value(document),
        _safe_value(blocked),
        _safe_value(directive),
    )


def _log_report(report: object) -> None:
    """Handle one report in either the ``report-uri`` or the Reporting API shape."""
    if not isinstance(report, dict):
        return
    # report-uri: {"csp-report": {"document-uri": ..., "blocked-uri": ..., ...}}
    legacy = report.get("csp-report", report)
    if isinstance(legacy, dict) and ("blocked-uri" in legacy or "document-uri" in legacy):
        _log_violation(
            legacy.get("document-uri"),
            legacy.get("blocked-uri"),
            legacy.get("violated-directive") or legacy.get("effective-directive"),
        )
        return
    # Reporting API: {"type": "csp-violation", "body": {"documentURL": ..., ...}}
    body = report.get("body")
    if isinstance(body, dict):
        _log_violation(
            body.get("documentURL") or report.get("url"),
            body.get("blockedURL"),
            body.get("effectiveDirective") or body.get("violatedDirective"),
        )


class CspReportView(APIView):
    """Accept CSP violations without retaining request bodies or user identity."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [CspReportRateThrottle]
    parser_classes = [JSONParser, CspReportParser, ReportsJsonParser]

    def post(self, request) -> Response:
        try:
            declared = int(request.META.get("CONTENT_LENGTH") or 0)
        except ValueError:
            declared = 0
        if declared > MAX_REPORT_BYTES:
            return Response(status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        data = request.data
        reports = data if isinstance(data, list) else [data]
        for report in reports[:MAX_REPORTS_PER_REQUEST]:
            _log_report(report)
        return Response(status=status.HTTP_204_NO_CONTENT)
