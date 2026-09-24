from uuid import UUID

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.throttles import CartWriteRateThrottle
from config.api_helpers import domain_error_response
from cart.models import CartItem
from cart.serializers import (
    CartAddSerializer,
    CartSerializer,
    CartUpdateQuantitySerializer,
)
from cart.services import CartError, CartService


def _cart_error_response(exc: CartError) -> Response:
    return domain_error_response(exc, default_code="cart_error")


def _serialize_cart(user) -> dict:
    envelope = CartService.get_cart_envelope(user)
    items_data = []
    for item in envelope.items:
        line_total = CartService.get_item_line_total(item, envelope.snapshots)
        unit_price = CartService.get_item_unit_price(item, envelope.snapshots)
        items_data.append(
            {
                "id": item.id,
                "product_type": item.product_type,
                "product_id": item.product_id,
                "quantity": item.quantity,
                "unit_price": unit_price,
                "line_total": f"{line_total:.2f}" if line_total is not None else None,
                "catalog": envelope.snapshots.get(
                    (item.product_type, item.product_id),
                ),
            }
        )

    serializer = CartSerializer(
        data={
            "id": envelope.cart.id,
            "currency": envelope.totals.currency,
            "subtotal": f"{envelope.totals.subtotal:.2f}",
            "discount_amount": f"{envelope.totals.discount_amount:.2f}",
            "total": f"{envelope.totals.total:.2f}",
            "item_count": envelope.totals.item_count,
            "total_quantity": envelope.totals.total_quantity,
            "items": items_data,
        }
    )
    serializer.is_valid(raise_exception=True)
    return serializer.data


def _serialize_item(user, item: CartItem) -> dict:
    envelope = CartService.get_cart_envelope(user)
    line_total = CartService.get_item_line_total(item, envelope.snapshots)
    unit_price = CartService.get_item_unit_price(item, envelope.snapshots)
    return {
        "id": item.id,
        "product_type": item.product_type,
        "product_id": item.product_id,
        "quantity": item.quantity,
        "unit_price": unit_price,
        "line_total": f"{line_total:.2f}" if line_total is not None else None,
        "catalog": envelope.snapshots.get((item.product_type, item.product_id)),
    }


class CartView(APIView):
    permission_classes = [IsAuthenticated]

    def get_throttles(self) -> list:
        if self.request.method in {"POST", "DELETE"}:
            return [CartWriteRateThrottle()]
        return super().get_throttles()

    def get(self, request: Request) -> Response:
        return Response(_serialize_cart(request.user))

    def post(self, request: Request) -> Response:
        serializer = CartAddSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            item, created = CartService.add_item(
                request.user,
                serializer.validated_data["product_type"],
                serializer.validated_data["product_id"],
                quantity=serializer.validated_data.get("quantity", 1),
            )
        except CartError as exc:
            return _cart_error_response(exc)

        return Response(
            _serialize_item(request.user, item),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request: Request) -> Response:
        try:
            CartService.clear_cart(request.user)
        except CartError as exc:
            return _cart_error_response(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CartItemDetailView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [CartWriteRateThrottle]

    def patch(self, request: Request, item_id: UUID) -> Response:
        serializer = CartUpdateQuantitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            item = CartService.update_quantity(
                request.user,
                item_id,
                serializer.validated_data["quantity"],
            )
        except CartError as exc:
            if exc.message == "Cart item not found.":
                raise NotFound(detail=exc.message) from exc
            return _cart_error_response(exc)

        return Response(_serialize_item(request.user, item))

    def delete(self, request: Request, item_id: UUID) -> Response:
        try:
            CartService.remove_item(request.user, item_id)
        except CartError as exc:
            raise NotFound(detail=exc.message) from exc
        return Response(status=status.HTTP_204_NO_CONTENT)
