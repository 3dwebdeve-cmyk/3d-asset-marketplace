"""Shared DRF pagination defaults for list endpoints."""

from urllib.parse import urlsplit

from rest_framework.pagination import PageNumberPagination


def _relative(url: str | None) -> str | None:
    """Path and query only. Behind the Cloudflare Worker the server sees its own Render host, so an
    absolute link would point visitors (and search engines) at the backend instead of the site."""
    if not url:
        return url
    parts = urlsplit(url)
    return f"{parts.path}?{parts.query}" if parts.query else parts.path


class StandardPagination(PageNumberPagination):
    """Marketplace default: page_size 20, client may request up to 100."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_next_link(self) -> str | None:
        return _relative(super().get_next_link())

    def get_previous_link(self) -> str | None:
        return _relative(super().get_previous_link())
