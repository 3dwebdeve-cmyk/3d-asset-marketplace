from uuid import UUID

from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdministrator
from accounts.security_log import log_admin_action
from accounts.throttles import AdminReviewWriteRateThrottle, ReviewWriteRateThrottle
from reviews.pagination import ReviewPagination
from reviews.serializers import (
    ReviewAdminSerializer,
    ReviewAdminUpdateSerializer,
    ReviewCreateSerializer,
    ReviewPublicSerializer,
)
from reviews.services import ReviewError, ReviewService


def _error_response(exc: ReviewError) -> Response:
    http_status = exc.status_code
    if exc.field:
        return Response(
            {exc.field: [exc.message]},
            status=http_status if http_status != 404 else status.HTTP_400_BAD_REQUEST,
        )
    if http_status == 404:
        raise NotFound(detail=exc.message)
    return Response(
        {"detail": exc.message, "code": exc.code},
        status=http_status,
    )


def _parse_uuid(value: str | None, field: str) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value.strip())
    except ValueError as exc:
        raise ValidationError({field: [f"Invalid {field}."]}) from exc


def _parse_bool(value: str | None, field: str) -> bool | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"true", "1", "yes"}:
        return True
    if normalized in {"false", "0", "no"}:
        return False
    raise ValidationError({field: [f"Invalid {field} filter."]})


class ReviewListCreateView(APIView):
    pagination_class = ReviewPagination

    def get_permissions(self) -> list:
        if self.request.method == "POST":
            return [IsAuthenticated()]
        return [AllowAny()]

    def get_throttles(self) -> list:
        if self.request.method == "POST":
            return [ReviewWriteRateThrottle()]
        return super().get_throttles()

    def get(self, request: Request) -> Response:
        product_type = request.query_params.get("product_type")
        product_id = _parse_uuid(
            request.query_params.get("product_id"),
            "product_id",
        )
        if not product_type or product_id is None:
            raise ValidationError(
                {
                    "product_type": ["This field is required."],
                    "product_id": ["This field is required."],
                }
                if not product_type and product_id is None
                else (
                    {"product_type": ["This field is required."]}
                    if not product_type
                    else {"product_id": ["This field is required."]}
                )
            )
        ordering = request.query_params.get("ordering") or "-created_at"
        try:
            queryset = ReviewService.list_public(
                product_type,
                product_id,
                ordering=ordering,
            )
        except ReviewError as exc:
            return _error_response(exc)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = ReviewPublicSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request: Request) -> Response:
        serializer = ReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            review, created = ReviewService.create_or_update(
                request.user,
                product_type=data["product_type"],
                product_id=data["product_id"],
                rating=data["rating"],
                review_text=data.get("review_text", ""),
            )
        except ReviewError as exc:
            return _error_response(exc)

        return Response(
            ReviewPublicSerializer(review).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class MyReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        product_type = request.query_params.get("product_type")
        product_id = _parse_uuid(
            request.query_params.get("product_id"),
            "product_id",
        )
        if not product_type or product_id is None:
            raise ValidationError(
                {
                    "detail": [
                        "product_type and product_id query parameters are required."
                    ]
                }
            )
        try:
            review = ReviewService.get_mine(request.user, product_type, product_id)
        except ReviewError as exc:
            return _error_response(exc)
        if review is None:
            return Response({"detail": "No review found.", "code": "not_found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ReviewPublicSerializer(review).data)


class ReviewEligibilityView(APIView):
    """Return whether the authenticated user can review a catalog item."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        product_type = request.query_params.get("product_type")
        product_id = _parse_uuid(
            request.query_params.get("product_id"),
            "product_id",
        )
        if not product_type or product_id is None:
            raise ValidationError(
                {
                    "detail": [
                        "product_type and product_id query parameters are required."
                    ]
                }
            )
        try:
            normalized = ReviewService._normalize_product_type(product_type)
            ReviewService._validate_catalog_item(normalized, product_id)
            can_review = ReviewService.user_has_purchased(
                request.user,
                normalized,
                product_id,
            )
            existing = ReviewService.get_mine(request.user, normalized, product_id)
        except ReviewError as exc:
            return _error_response(exc)

        return Response(
            {
                "can_review": can_review,
                "has_reviewed": existing is not None,
                "review": ReviewPublicSerializer(existing).data if existing else None,
            }
        )


class AdminReviewListView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    pagination_class = ReviewPagination

    def get(self, request: Request) -> Response:
        queryset = ReviewService.list_admin(
            product_type=request.query_params.get("product_type") or None,
            product_id=_parse_uuid(
                request.query_params.get("product_id"),
                "product_id",
            ),
            is_hidden=_parse_bool(
                request.query_params.get("is_hidden"),
                "is_hidden",
            ),
            search=request.query_params.get("search") or None,
            ordering=request.query_params.get("ordering") or "-created_at",
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        titles = ReviewService.build_catalog_titles(page)
        serializer = ReviewAdminSerializer(
            page,
            many=True,
            context={"catalog_titles": titles},
        )
        return paginator.get_paginated_response(serializer.data)


class AdminReviewDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdministrator]
    throttle_classes = [AdminReviewWriteRateThrottle]

    def patch(self, request: Request, review_id: UUID) -> Response:
        serializer = ReviewAdminUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            review = ReviewService.get_for_admin(review_id)
            review = ReviewService.set_hidden(
                review,
                serializer.validated_data["is_hidden"],
            )
        except ReviewError as exc:
            return _error_response(exc)

        action = "review_hide" if review.is_hidden else "review_unhide"
        log_admin_action(
            action=action,
            actor_id=str(request.user.id),
            target_id=str(review.id),
        )
        titles = ReviewService.build_catalog_titles([review])
        return Response(
            ReviewAdminSerializer(
                review,
                context={"catalog_titles": titles},
            ).data
        )

    def delete(self, request: Request, review_id: UUID) -> Response:
        try:
            review = ReviewService.get_for_admin(review_id)
            ReviewService.delete(review)
        except ReviewError as exc:
            return _error_response(exc)

        log_admin_action(
            action="review_delete",
            actor_id=str(request.user.id),
            target_id=str(review_id),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
