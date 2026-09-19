"""Short public cache headers for catalog JSON (CDN / browser). Never cache errors."""

from __future__ import annotations

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


class PublicCatalogCacheMixin:
    """Apply catalog Cache-Control on successful GET. Admin views must not use this."""

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        if getattr(request, "method", "") == "GET":
            apply_public_catalog_cache(response)
        return response
