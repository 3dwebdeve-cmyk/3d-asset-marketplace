from __future__ import annotations

import math
from typing import Any

from rest_framework.exceptions import NotFound
from rest_framework.pagination import PageNumberPagination
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.utils.urls import remove_query_param, replace_query_param


def parse_page(request: Request, paginator: PageNumberPagination) -> tuple[int, int]:
    page_size = paginator.get_page_size(request) or paginator.page_size or 20
    raw = request.query_params.get(paginator.page_query_param, 1)
    try:
        page = int(raw)
    except (TypeError, ValueError) as exc:
        raise NotFound("Invalid page.") from exc
    if page < 1:
        raise NotFound("Invalid page.")
    return page, page_size


def paginated_list_response(
    request: Request,
    *,
    paginator: PageNumberPagination,
    items: list[Any],
    total: int,
    page: int,
    page_size: int,
    serializer_class: type,
) -> Response:
    num_pages = 1 if total == 0 else max(1, math.ceil(total / page_size))
    if page > num_pages:
        raise NotFound("Invalid page.")

    url = request.build_absolute_uri()
    page_param = paginator.page_query_param
    next_url = None
    previous_url = None
    if page < num_pages and total > 0:
        next_url = replace_query_param(url, page_param, page + 1)
    if page > 1:
        if page - 1 == 1:
            previous_url = remove_query_param(url, page_param)
        else:
            previous_url = replace_query_param(url, page_param, page - 1)

    return Response(
        {
            "count": total,
            "next": next_url,
            "previous": previous_url,
            "results": serializer_class(items, many=True).data,
        }
    )
