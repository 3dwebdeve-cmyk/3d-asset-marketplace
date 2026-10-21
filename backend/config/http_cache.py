"""Short public cache headers for catalog JSON (CDN / browser). Never cache errors."""

from __future__ import annotations

import hashlib
import json

from django.http import HttpResponseNotModified
from rest_framework.response import Response

# 30s browser / 60s shared (Nginx/CDN). Admin publishes stay visible within a minute.
PUBLIC_CATALOG_CACHE_CONTROL = (
    "public, max-age=30, s-maxage=60, stale-while-revalidate=30"
)


def apply_public_catalog_cache(response: Response) -> Response:
    if getattr(response, "status_code", None) == 200:
        response["Cache-Control"] = PUBLIC_CATALOG_CACHE_CONTROL
        existing_vary = response.get("Vary", "")
        if "Accept" not in existing_vary:
            response["Vary"] = (
                f"{existing_vary}, Accept".lstrip(", ").strip()
                if existing_vary
                else "Accept"
            )
    return response


def _etag_matches(if_none_match: str, etag: str) -> bool:
    # Compression marks the ETag weak (W/"..."), so browsers send it back that way.
    # If-None-Match uses weak comparison and may list several tags.
    candidates = {tag.strip().removeprefix("W/") for tag in if_none_match.split(",")}
    return etag in candidates or "*" in candidates


def apply_public_catalog_etag(request, response: Response):
    """Make catalog refetches cheap when the representation has not changed."""
    if getattr(response, "status_code", None) != 200:
        return response
    try:
        payload = json.dumps(
            response.data, sort_keys=True, separators=(",", ":"), default=str
        ).encode("utf-8")
    except (TypeError, ValueError):
        return response
    etag = f'"{hashlib.sha256(payload).hexdigest()}"'
    if _etag_matches(request.headers.get("If-None-Match", ""), etag):
        not_modified = HttpResponseNotModified()
        not_modified["ETag"] = etag
        not_modified["Cache-Control"] = PUBLIC_CATALOG_CACHE_CONTROL
        not_modified["Vary"] = "Accept"
        return not_modified
    response["ETag"] = etag
    return response


class PublicCatalogCacheMixin:
    """Apply catalog Cache-Control on successful GET. Admin views must not use this."""

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        if getattr(request, "method", "") == "GET":
            apply_public_catalog_cache(response)
            response = apply_public_catalog_etag(request, response)
        return response
