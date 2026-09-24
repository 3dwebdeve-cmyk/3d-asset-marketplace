from uuid import UUID

from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from accounts.security_log import log_admin_action
from config.api_helpers import domain_error_response
from coupons.pagination import CouponPagination
from coupons.serializers import (
    CouponAdminSerializer,
    CouponCreateSerializer,
    CouponUpdateSerializer,
)
from coupons.services import (
    CouponCreateData,
    CouponError,
    CouponService,
    CouponUpdateData,
)
from rest_framework.throttling import UserRateThrottle


class AdminCouponWriteRateThrottle(UserRateThrottle):
    """Soft-removed coupon admin API (routes unmounted)."""

    scope = "user"


def _coupon_error_response(exc: CouponError) -> Response:
    return domain_error_response(exc, default_code="coupon_error")


def _parse_active_filter(value: str | None) -> bool | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"true", "1"}:
        return True
    if normalized in {"false", "0"}:
        return False
    raise ValidationError({"active": ["Must be true or false."]})


class AdminCouponListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    pagination_class = CouponPagination
    throttle_classes = [AdminCouponWriteRateThrottle]

    def get(self, request: Request) -> Response:
        active = _parse_active_filter(request.query_params.get("active"))
        discount_type = request.query_params.get("discount_type") or None
        search = request.query_params.get("search") or None
        ordering = request.query_params.get("ordering") or None

        queryset = CouponService.list_admin(
            active=active,
            discount_type=discount_type,
            search=search,
            ordering=ordering,
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = CouponAdminSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request: Request) -> Response:
        serializer = CouponCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            coupon = CouponService.create_coupon(
                CouponCreateData(
                    code=serializer.validated_data["code"],
                    discount_type=serializer.validated_data["discount_type"],
                    discount_value=serializer.validated_data["discount_value"],
                    expiry_date=serializer.validated_data.get("expiry_date"),
                    active=serializer.validated_data.get("active", True),
                    max_uses=serializer.validated_data.get("max_uses"),
                    max_uses_per_user=serializer.validated_data.get("max_uses_per_user"),
                )
            )
        except CouponError as exc:
            return _coupon_error_response(exc)

        log_admin_action(
            action="coupon_create",
            actor_id=str(request.user.pk),
            target_id=str(coupon.pk),
        )
        return Response(
            CouponAdminSerializer(coupon).data,
            status=status.HTTP_201_CREATED,
        )


class AdminCouponDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminCouponWriteRateThrottle]

    def get(self, request: Request, coupon_id: UUID) -> Response:
        try:
            coupon = CouponService.get_by_id(coupon_id)
        except CouponError as exc:
            raise NotFound(exc.message) from exc

        return Response(
            CouponAdminSerializer(coupon).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, coupon_id: UUID) -> Response:
        try:
            coupon = CouponService.get_by_id(coupon_id)
        except CouponError as exc:
            raise NotFound(exc.message) from exc

        serializer = CouponUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        try:
            updated = CouponService.update_coupon(
                coupon,
                CouponUpdateData(
                    code=serializer.validated_data.get("code"),
                    discount_type=serializer.validated_data.get("discount_type"),
                    discount_value=serializer.validated_data.get("discount_value"),
                    expiry_date=serializer.validated_data.get("expiry_date"),
                    clear_expiry_date=serializer.validated_data.get(
                        "clear_expiry_date",
                        False,
                    ),
                    active=serializer.validated_data.get("active"),
                    max_uses=serializer.validated_data.get("max_uses"),
                    clear_max_uses=serializer.validated_data.get("clear_max_uses", False),
                    max_uses_per_user=serializer.validated_data.get("max_uses_per_user"),
                    clear_max_uses_per_user=serializer.validated_data.get(
                        "clear_max_uses_per_user",
                        False,
                    ),
                ),
            )
        except CouponError as exc:
            return _coupon_error_response(exc)

        log_admin_action(
            action="coupon_update",
            actor_id=str(request.user.pk),
            target_id=str(updated.pk),
        )
        return Response(
            CouponAdminSerializer(updated).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request: Request, coupon_id: UUID) -> Response:
        try:
            coupon = CouponService.get_by_id(coupon_id)
        except CouponError as exc:
            raise NotFound(exc.message) from exc

        hard_delete = (
            request.query_params.get("hard", "").strip().lower() in {"true", "1"}
        )
        try:
            if hard_delete:
                CouponService.delete_coupon(coupon)
                log_admin_action(
                    action="coupon_delete",
                    actor_id=str(request.user.pk),
                    target_id=str(coupon_id),
                )
                return Response(status=status.HTTP_204_NO_CONTENT)

            updated = CouponService.deactivate_coupon(coupon)
        except CouponError as exc:
            return _coupon_error_response(exc)

        log_admin_action(
            action="coupon_deactivate",
            actor_id=str(request.user.pk),
            target_id=str(updated.pk),
        )
        return Response(
            CouponAdminSerializer(updated).data,
            status=status.HTTP_200_OK,
        )
