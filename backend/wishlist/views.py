from uuid import UUID

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.throttles import WishlistWriteRateThrottle
from wishlist.pagination import WishlistPagination
from wishlist.serializers import WishlistAddSerializer, WishlistItemSerializer
from wishlist.services import WishlistError, WishlistService


def _wishlist_error_response(exc: WishlistError) -> Response:
    if exc.field:
        return Response(
            {exc.field: [exc.message]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(
        {"detail": exc.message, "code": "wishlist_error"},
        status=status.HTTP_400_BAD_REQUEST,
    )


class WishlistListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = WishlistPagination

    def get_throttles(self) -> list:
        if self.request.method == "POST":
            return [WishlistWriteRateThrottle()]
        return super().get_throttles()

    def get(self, request: Request) -> Response:
        product_type = request.query_params.get("product_type") or None
        ordering = request.query_params.get("ordering") or None
        try:
            queryset = WishlistService.list_for_user(
                request.user,
                product_type=product_type,
                ordering=ordering or "-created_at",
            )
        except WishlistError as exc:
            return _wishlist_error_response(exc)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        snapshots = WishlistService.build_catalog_snapshots(page)
        serializer = WishlistItemSerializer(
            page,
            many=True,
            context={"catalog_snapshots": snapshots},
        )
        return paginator.get_paginated_response(serializer.data)

    def post(self, request: Request) -> Response:
        serializer = WishlistAddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            item, created = WishlistService.add(
                request.user,
                serializer.validated_data["product_type"],
                serializer.validated_data["product_id"],
            )
        except WishlistError as exc:
            return _wishlist_error_response(exc)

        snapshots = WishlistService.build_catalog_snapshots([item])
        response_serializer = WishlistItemSerializer(
            item,
            context={"catalog_snapshots": snapshots},
        )
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class WishlistDetailView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [WishlistWriteRateThrottle]

    def delete(self, request: Request, item_id: UUID) -> Response:
        try:
            WishlistService.remove(request.user, item_id)
        except WishlistError as exc:
            raise NotFound(detail=exc.message) from exc
        return Response(status=status.HTTP_204_NO_CONTENT)
