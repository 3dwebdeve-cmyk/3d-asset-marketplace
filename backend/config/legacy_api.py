"""Legacy /api/... → /api/v1/... path alias for one release."""

from __future__ import annotations

from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

API_ROOT = "/api/"
API_V1_ROOT = "/api/v1/"


def rewrite_legacy_api_path(path: str) -> str | None:
    """Return the v1 path when *path* is a legacy unversioned API URL.

    Leaves /api/v1/... and non-API paths unchanged (returns None).
    """
    if path.startswith(API_V1_ROOT):
        return None
    if path == "/api":
        return "/api/v1"
    if path.startswith(API_ROOT):
        suffix = path[len(API_ROOT) :]
        return f"{API_V1_ROOT}{suffix}"
    return None


class LegacyApiPathAliasMiddleware:
    """Rewrite unversioned /api/* requests onto /api/v1/* before URL resolution.

    Same views, permissions, and throttles as the canonical mount — no auth or
    entitlement rule changes. Remove after clients migrate off /api/.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        rewritten = rewrite_legacy_api_path(request.path_info)
        if rewritten is not None:
            request.path_info = rewritten
            # Keep request.path aligned for code that reads it directly.
            script = request.META.get("SCRIPT_NAME", "") or ""
            request.path = f"{script}{rewritten}"
        return self.get_response(request)
