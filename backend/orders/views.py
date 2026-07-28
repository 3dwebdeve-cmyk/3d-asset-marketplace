from uuid import UUID

from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from accounts.security_log import log_admin_action
from accounts.throttles import AdminOrderWriteRateThrottle
from orders.models import Order
from orders.pagination import OrderPagination
from orders.serializers import (
    AdminOrderCreateSerializer,
    OrderDetailSerializer,
    OrderListSerializer,
)
from orders.services import OrderCreateData, OrderError, OrderItemCreateData, OrderService


def _error_response(exc: OrderError) -> Response:
    if exc.field:
        return Response(
            {exc.field: [exc.message]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(
        {"detail": exc.message, "code": "order_error"},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _parse_uuid(value: str | None, field: str) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value.strip())
    except ValueError as exc:
        raise ValidationError({field: [f"Invalid {field}."]}) from exc


def _parse_choice(value: str | None, field: str, allowed: set[str]) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized not in allowed:
        raise ValidationError({field: [f"Invalid {field} filter."]})
    return normalized


def _detail_serializer_context(order: Order) -> dict:
    items = list(order.items.all())
    return {
        "catalog_titles": OrderService.build_catalog_titles(items),
    }


class AdminOrderListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminOrderWriteRateThrottle]
    pagination_class = OrderPagination

    def get(self, request: Request) -> Response:
        queryset = OrderService.list_admin(
            order_status=_parse_choice(
                request.query_params.get("order_status"),
                "order_status",
                set(Order.OrderStatus.values),
            ),
            payment_status=_parse_choice(
                request.query_params.get("payment_status"),
                "payment_status",
                set(Order.PaymentStatus.values),
            ),
            customer_id=_parse_uuid(
                request.query_params.get("customer_id"),
                "customer_id",
            ),
            search=request.query_params.get("search") or None,
            ordering=request.query_params.get("ordering") or "-created_at",
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            OrderListSerializer(page, many=True).data
        )

    def post(self, request: Request) -> Response:
        serializer = AdminOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data
        customer_id = payload.pop("customer_id")
        items = payload.pop("items")
        try:
            order = OrderService.create(
                OrderCreateData(
                    user_id=customer_id,
                    items=tuple(
                        OrderItemCreateData(
                            product_type=item["product_type"],
                            product_id=item["product_id"],
                            quantity=item["quantity"],
                        )
                        for item in items
                    ),
                    currency=payload.get("currency", "USD"),
                )
            )
        except OrderError as exc:
            return _error_response(exc)
        log_admin_action(
            action="order_create",
            actor_id=str(request.user.id),
            target_id=str(order.id),
        )
        return Response(
            OrderDetailSerializer(order, context=_detail_serializer_context(order)).data,
            status=status.HTTP_201_CREATED,
        )


class AdminOrderDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]

    def get(self, request: Request, order_id: UUID) -> Response:
        try:
            order = OrderService.get(order_id)
        except OrderError as exc:
            raise NotFound(detail=exc.message) from exc
        return Response(
            OrderDetailSerializer(order, context=_detail_serializer_context(order)).data
        )
