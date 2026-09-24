from uuid import UUID

from django.http import FileResponse
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from accounts.throttles import DownloadRateThrottle
from config.api_helpers import parse_uuid
from downloads.pagination import DownloadPagination
from downloads.serializers import (
    DownloadEntitlementSerializer,
    DownloadHistorySerializer,
    SignedDownloadSerializer,
)
from downloads.services import DownloadError, DownloadService


def _parse_product_type(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized not in {"product", "plugin"}:
        raise ValidationError({"product_type": ["Invalid product_type filter."]})
    return normalized


class DownloadEntitlementListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        entitlements = DownloadService.list_entitlements(request.user)
        serializer = DownloadEntitlementSerializer(
            entitlements,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data)


class CustomerDownloadHistoryListView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = DownloadPagination

    def get(self, request: Request) -> Response:
        queryset = DownloadService.list_history_for_user(request.user)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            DownloadHistorySerializer(page, many=True).data
        )


class ProductFileDownloadView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [DownloadRateThrottle]

    def get(self, request: Request, product_id: UUID, file_id: UUID) -> FileResponse | Response:
        try:
            result = DownloadService.stream_product_file(request.user, product_id, file_id)
        except DownloadError as exc:
            raise NotFound(detail=exc.message) from exc
        if isinstance(result, dict):
            return Response(SignedDownloadSerializer(result).data)
        return result


class PluginFileDownloadView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [DownloadRateThrottle]

    def get(self, request: Request, plugin_id: UUID, file_id: UUID) -> FileResponse | Response:
        try:
            result = DownloadService.stream_plugin_file(request.user, plugin_id, file_id)
        except DownloadError as exc:
            raise NotFound(detail=exc.message) from exc
        if isinstance(result, dict):
            return Response(SignedDownloadSerializer(result).data)
        return result


class AdminDownloadHistoryListView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    pagination_class = DownloadPagination

    def get(self, request: Request) -> Response:
        queryset = DownloadService.list_history_admin(
            user_email=request.query_params.get("user_email") or None,
            product_type=_parse_product_type(request.query_params.get("product_type")),
            product_id=parse_uuid(request.query_params.get("product_id"), "product_id"),
            ordering=request.query_params.get("ordering") or "-downloaded_at",
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            DownloadHistorySerializer(page, many=True).data
        )
