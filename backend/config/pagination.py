"""Shared DRF pagination defaults for list endpoints."""

from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Marketplace default: page_size 20, client may request up to 100."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
