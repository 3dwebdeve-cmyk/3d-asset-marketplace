from io import BytesIO
from uuid import UUID

from django.db import transaction
from django.http import FileResponse
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from accounts.security_log import log_admin_action
from accounts.throttles import AdminOrderWriteRateThrottle, LicenseVerifyRateThrottle
from config.api_helpers import domain_error_response, parse_choice, parse_uuid
from downloads.services import DownloadService
from orders.entitlements import order_allows_download
from orders.invoice import build_invoice_pdf, invoice_pdf_filename
from orders.license import (
    LicenseError,
    build_license_pdf,
    issue_license,
    license_pdf_filename,
    verify_license,
)
from orders.models import Order
from orders.pagination import OrderPagination
from orders.serializers import (
    AdminOrderCreateSerializer,
    AdminOrderStatusUpdateSerializer,
    CustomerOrderDetailSerializer,
    CustomerOrderListSerializer,
    OrderDetailSerializer,
    OrderListSerializer,
)
from orders.services import (
    ALLOWED_CUSTOMER_ITEM_TYPES,
    OrderCreateData,
    OrderError,
    OrderItemCreateData,
    OrderService,
)

def _error_response(exc: OrderError) -> Response:
    return domain_error_response(exc, default_code="order_error")


def _detail_serializer_context(order: Order, request: Request | None = None) -> dict:
    items = list(order.items.all())
    snapshots = OrderService.build_catalog_snapshots(items)
    downloadable_files = {}
    if order_allows_download(order):
        downloadable_files = DownloadService.list_downloadable_files_for_items(
            [(item.product_type, item.product_id) for item in items]
        )
    context = {
        "catalog_titles": {key: title for key, (title, _slug) in snapshots.items()},
        "catalog_slugs": {key: slug for key, (_title, slug) in snapshots.items()},
        "order": order,
        "downloadable_files": downloadable_files,
    }
    if request is not None:
        context["request"] = request
    return context


class AdminOrderListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminOrderWriteRateThrottle]
    pagination_class = OrderPagination

    def get(self, request: Request) -> Response:
        queryset = OrderService.list_admin(
            order_status=parse_choice(
                request.query_params.get("order_status"),
                "order_status",
                set(Order.OrderStatus.values),
            ),
            payment_status=parse_choice(
                request.query_params.get("payment_status"),
                "payment_status",
                set(Order.PaymentStatus.values),
            ),
            customer_id=parse_uuid(
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
    throttle_classes = [AdminOrderWriteRateThrottle]

    def get(self, request: Request, order_id: UUID) -> Response:
        try:
            order = OrderService.get(order_id)
        except OrderError as exc:
            raise NotFound(detail=exc.message) from exc
        return Response(
            OrderDetailSerializer(order, context=_detail_serializer_context(order)).data
        )

    def patch(self, request: Request, order_id: UUID) -> Response:
        serializer = AdminOrderStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            # One transaction: a failing second change must not leave the first applied.
            with transaction.atomic():
                order = OrderService.get(order_id)
                if "order_status" in serializer.validated_data:
                    order = OrderService.update_order_status(
                        order,
                        serializer.validated_data["order_status"],
                    )
                if "payment_status" in serializer.validated_data:
                    order = OrderService.update_payment_status(
                        order,
                        serializer.validated_data["payment_status"],
                    )
        except OrderError as exc:
            return _error_response(exc)

        log_admin_action(
            action="order_status_update",
            actor_id=str(request.user.id),
            target_id=str(order.id),
        )
        return Response(
            OrderDetailSerializer(order, context=_detail_serializer_context(order)).data
        )


class CustomerOrderListView(APIView):
    permission_classes = [IsAuthenticated]
    pagination_class = OrderPagination

    def get(self, request: Request) -> Response:
        queryset = OrderService.list_for_user(
            request.user,
            order_status=parse_choice(
                request.query_params.get("order_status"),
                "order_status",
                set(Order.OrderStatus.values),
            ),
            payment_status=parse_choice(
                request.query_params.get("payment_status"),
                "payment_status",
                set(Order.PaymentStatus.values),
            ),
            item_type=parse_choice(
                request.query_params.get("item_type"),
                "item_type",
                set(ALLOWED_CUSTOMER_ITEM_TYPES),
            ),
            search=request.query_params.get("search") or None,
            ordering=request.query_params.get("ordering") or "-created_at",
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            CustomerOrderListSerializer(page, many=True).data
        )


class CustomerOrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, order_id: UUID) -> Response:
        try:
            order = OrderService.get_for_user(order_id, request.user)
        except OrderError as exc:
            raise NotFound(detail=exc.message) from exc
        return Response(
            CustomerOrderDetailSerializer(
                order,
                context=_detail_serializer_context(order, request),
            ).data
        )


def _invoice_file_response(order: Order) -> FileResponse:
    if not order_allows_download(order):
        raise PermissionDenied(detail="Invoice is available only for paid orders.")
    pdf_bytes = build_invoice_pdf(order)
    return FileResponse(
        BytesIO(pdf_bytes),
        as_attachment=True,
        filename=invoice_pdf_filename(order),
        content_type="application/pdf",
    )


class CustomerOrderInvoiceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, order_id: UUID) -> FileResponse:
        try:
            order = OrderService.get_for_user(order_id, request.user)
        except OrderError as exc:
            raise NotFound(detail=exc.message) from exc
        return _invoice_file_response(order)


class AdminOrderInvoiceView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]

    def get(self, request: Request, order_id: UUID) -> FileResponse:
        try:
            order = OrderService.get(order_id)
        except OrderError as exc:
            raise NotFound(detail=exc.message) from exc
        return _invoice_file_response(order)


class CustomerOrderItemLicenseView(APIView):
    """License certificate PDF for one line of the buyer's own paid order."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, order_id: UUID, item_id: UUID) -> FileResponse:
        try:
            order = OrderService.get_for_user(order_id, request.user)
        except OrderError as exc:
            raise NotFound(detail=exc.message) from exc
        item = order.items.filter(pk=item_id).first()
        if item is None:
            raise NotFound(detail="Order item not found.")
        item.order = order
        try:
            item = issue_license(item)
        except LicenseError as exc:
            raise PermissionDenied(detail=str(exc)) from exc
        return FileResponse(
            BytesIO(build_license_pdf(order, item)),
            as_attachment=True,
            filename=license_pdf_filename(item),
            content_type="application/pdf",
        )


class LicenseVerifyView(APIView):
    """Public check of a license code. Returns no buyer data."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LicenseVerifyRateThrottle]

    def get(self, request: Request, code: str) -> Response:
        result = verify_license(code)
        if result is None:
            raise NotFound(detail="License not found.")
        return Response(result)
