import logging

import stripe
from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from uuid import UUID

from accounts.permissions import IsAdministrator, IsEmailVerified
from accounts.throttles import PaymentCheckoutRateThrottle
from config.sentry import capture_webhook_failure
from payments.pagination import PaymentPagination
from payments.serializers import AdminPaymentDetailSerializer, AdminPaymentListSerializer
from payments.services import (
    ALLOWED_PAYMENT_STATUS_FILTERS,
    AdminPaymentError,
    AdminPaymentService,
    CheckoutError,
    CheckoutService,
    WebhookService,
)

logger = logging.getLogger(__name__)


def _parse_choice(value: str | None, field: str, allowed: set[str]) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized not in allowed:
        raise ValidationError({field: [f"Invalid {field} filter."]})
    return normalized


class CreateCheckoutSessionView(APIView):
    permission_classes = [IsAuthenticated, IsEmailVerified]
    throttle_classes = [PaymentCheckoutRateThrottle]

    def post(self, request: Request) -> Response:
        try:
            result = CheckoutService.create_checkout_session(request.user)
        except CheckoutError as exc:
            if exc.field:
                return Response(
                    {exc.field: [exc.message]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"detail": exc.message, "code": "checkout_error"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(result, status=status.HTTP_201_CREATED)


class StripeWebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = []

    def post(self, request: Request) -> Response:
        payload = request.body
        sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")

        if not settings.STRIPE_WEBHOOK_SECRET:
            capture_webhook_failure(
                "Stripe webhook secret is not configured",
                reason="secret_missing",
                level="error",
            )
            return Response(
                {"detail": "Webhook not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            event = stripe.Webhook.construct_event(
                payload,
                sig_header,
                settings.STRIPE_WEBHOOK_SECRET,
            )
        except (ValueError, stripe.error.SignatureVerificationError):
            capture_webhook_failure(
                "Stripe webhook signature verification failed",
                reason="invalid_signature",
                level="warning",
            )
            return Response(
                {"detail": "Invalid webhook payload or signature."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            WebhookService.handle_event(event)
        except Exception as exc:
            logger.exception(
                "stripe_webhook_handler_failed event_type=%s",
                getattr(event, "type", None),
            )
            capture_webhook_failure(
                "Stripe webhook handler failed",
                reason="handler_exception",
                level="error",
                event_type=getattr(event, "type", None),
                exc=exc,
            )
            return Response(
                {"detail": "Webhook processing failed."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(status=status.HTTP_200_OK)


class ConfirmCheckoutSessionView(APIView):
    """Owner-only Stripe session sync used by /checkout/success when webhooks lag."""

    permission_classes = [IsAuthenticated, IsEmailVerified]
    throttle_classes = [PaymentCheckoutRateThrottle]

    def post(self, request: Request) -> Response:
        raw_order_id = request.data.get("order_id")
        if not raw_order_id:
            raise ValidationError({"order_id": ["This field is required."]})
        try:
            order_id = UUID(str(raw_order_id).strip())
        except ValueError as exc:
            raise ValidationError({"order_id": ["Invalid order_id."]}) from exc

        try:
            order = CheckoutService.confirm_checkout_session(request.user, order_id)
        except CheckoutError as exc:
            if exc.message == "Order not found.":
                raise NotFound(detail=exc.message) from exc
            if exc.field:
                return Response(
                    {exc.field: [exc.message]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"detail": exc.message, "code": "checkout_confirm_error"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "order_id": str(order.id),
                "payment_status": order.payment_status,
                "order_status": order.order_status,
            },
            status=status.HTTP_200_OK,
        )


class AdminPaymentListView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    pagination_class = PaymentPagination

    def get(self, request: Request) -> Response:
        try:
            queryset = AdminPaymentService.list_admin(
                status=_parse_choice(
                    request.query_params.get("status"),
                    "status",
                    ALLOWED_PAYMENT_STATUS_FILTERS,
                ),
                search=request.query_params.get("search") or None,
                created_after=request.query_params.get("created_after") or None,
                created_before=request.query_params.get("created_before") or None,
                ordering=request.query_params.get("ordering") or "-created_at",
            )
        except AdminPaymentError as exc:
            if exc.field:
                raise ValidationError({exc.field: [exc.message]}) from exc
            raise ValidationError({"detail": [exc.message]}) from exc

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return paginator.get_paginated_response(
            AdminPaymentListSerializer(page, many=True).data
        )


class AdminPaymentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]

    def get(self, request: Request, payment_id: UUID) -> Response:
        try:
            payment = AdminPaymentService.get(payment_id)
        except AdminPaymentError as exc:
            raise NotFound(detail=exc.message) from exc
        return Response(AdminPaymentDetailSerializer(payment).data)
