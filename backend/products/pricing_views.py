"""Pricing page API (docs/PRICING_PIPELINE.md). Administrators only.

GET  /api/v1/admin/products/pricing/            models in a tab, with filters
GET  /api/v1/admin/products/pricing/batches/    upload batch IDs in a tab (filter list)
POST /api/v1/admin/products/pricing/calculate/  the prices the selection would get (no change)
POST /api/v1/admin/products/pricing/publish/    save the calculated prices and publish
POST /api/v1/admin/products/pricing/hours/      set the models' hours spent
"""

from __future__ import annotations

from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from accounts.security_log import log_admin_action
from accounts.step_up import RequiresAdminStepUp
from accounts.throttles import AdminPricingReadRateThrottle, AdminProductWriteRateThrottle
from config.api_helpers import domain_error_response
from products import pricing
from products.errors import ProductError
from products.pagination import ProductPagination
from products.pricing_serializers import (
    PricingCalculateSerializer,
    PricingHoursSerializer,
    PricingListQuerySerializer,
    PricingPublishSerializer,
    PricingRowSerializer,
)


def _error(exc: ProductError) -> Response:
    http_status = (
        status.HTTP_409_CONFLICT
        if isinstance(exc, pricing.PricingConflict)
        else status.HTTP_400_BAD_REQUEST
    )
    return domain_error_response(exc, default_code="pricing_error", http_status=http_status)


class _PricingView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    parser_classes = [JSONParser]


class AdminPricingListView(_PricingView):
    throttle_classes = [AdminPricingReadRateThrottle]
    pagination_class = ProductPagination

    def get(self, request: Request) -> Response:
        query = PricingListQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data
        try:
            queryset = pricing.list_models(
                tab=data["tab"],
                category_id=data.get("category_id"),
                subcategory_id=data.get("subcategory_id"),
                search=data.get("search"),
                import_batch_id=data.get("import_batch_id"),
                ordering=data.get("ordering"),
            )
        except ProductError as exc:
            return _error(exc)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = PricingRowSerializer(page, many=True, context={"now": timezone.now()})
        return paginator.get_paginated_response(serializer.data)


class AdminPricingBatchesView(_PricingView):
    throttle_classes = [AdminPricingReadRateThrottle]

    def get(self, request: Request) -> Response:
        tab = request.query_params.get("tab", "")
        if tab not in pricing.TABS:
            return Response(
                {"tab": ["Tab must be 'waiting' or 'live'."]}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response({"results": pricing.list_batches(tab)}, status=status.HTTP_200_OK)


class AdminPricingCalculateView(_PricingView):
    throttle_classes = [AdminPricingReadRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = PricingCalculateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            plan = pricing.calculate(
                serializer.validated_data["product_ids"], serializer.pricing_input()
            )
        except ProductError as exc:
            return _error(exc)
        return Response(plan.to_dict(), status=status.HTTP_200_OK)


class AdminPricingPublishView(_PricingView):
    # Puts prices on the live store: asks for a fresh authenticator code (accounts.step_up).
    permission_classes = [*_PricingView.permission_classes, RequiresAdminStepUp]
    throttle_classes = [AdminProductWriteRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = PricingPublishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            pricing_input = serializer.pricing_input()
            result = pricing.publish(
                data["product_ids"],
                pricing_input,
                preview_token=data["preview_token"],
                confirm_count=data["confirm_count"],
                actor=request.user,
            )
        except ProductError as exc:
            return _error(exc)
        log_admin_action(
            action="pricing_publish",
            actor_id=str(request.user.pk),
            target_id=result["batch_id"],
            metadata={
                "input": pricing_input.canonical(),
                "published": [row["id"] for row in result["results"] if row["published"]],
                "failed": [row["id"] for row in result["results"] if not row["published"]],
            },
        )
        return Response(result, status=status.HTTP_200_OK)


class AdminPricingHoursView(_PricingView):
    throttle_classes = [AdminProductWriteRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = PricingHoursSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        items = serializer.validated_data["items"]
        try:
            changed = pricing.save_hours(items)
        except ProductError as exc:
            return _error(exc)
        log_admin_action(
            action="pricing_hours",
            actor_id=str(request.user.pk),
            metadata={"models": len(items), "changed": changed},
        )
        return Response({"models": len(items), "changed": changed}, status=status.HTTP_200_OK)
