"""Read-only price history for administrators."""

from __future__ import annotations

from uuid import UUID

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from accounts.throttles import AdminProductWriteRateThrottle
from products.models import ProductPriceChange
from products.price_history_serializers import ProductPriceChangeSerializer
from products.services import ProductError, ProductService

PRICE_HISTORY_LIMIT = 100


class AdminProductPriceHistoryView(APIView):
    """GET /api/v1/admin/products/<id>/price-history/ — the latest 100 price changes, newest first."""

    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminProductWriteRateThrottle]

    def get(self, request: Request, product_id: UUID) -> Response:
        try:
            product = ProductService.get_by_id(product_id)
        except ProductError as exc:
            raise NotFound(exc.message) from exc

        rows = (
            ProductPriceChange.objects.filter(product=product)
            .select_related("changed_by")
            .order_by("-created_at", "-id")[:PRICE_HISTORY_LIMIT]
        )
        return Response(
            {"results": ProductPriceChangeSerializer(rows, many=True).data},
            status=status.HTTP_200_OK,
        )
