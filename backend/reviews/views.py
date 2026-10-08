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
from config.api_helpers import domain_error_response, parse_uuid
from reviews.pagination import ReviewPagination
from reviews.serializers import (
    ReviewAdminSerializer,
    ReviewAdminUpdateSerializer,
    ReviewCreateSerializer,
    ReviewPublicSerializer,
    ReviewReactionSerializer,
    ReviewReplyCreateSerializer,
    ReviewReplySerializer,
)
from reviews.models import Review, ReviewReaction, ReviewReply, ReviewReplyReaction
from reviews.services import ReviewError, ReviewService
from orders.entitlements import user_owns_catalog_item


def _error_response(exc: ReviewError) -> Response:
    http_status = exc.status_code
    if exc.field:
        return domain_error_response(
            exc,
            default_code=getattr(exc, "code", None) or "review_error",
            http_status=(
                http_status
                if http_status != 404
                else status.HTTP_400_BAD_REQUEST
            ),
        )
    if http_status == 404:
        raise NotFound(detail=exc.message)
    return domain_error_response(
        exc,
        default_code=getattr(exc, "code", None) or "review_error",
        http_status=http_status,
    )


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
        product_id = parse_uuid(
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
        serializer = ReviewPublicSerializer(page, many=True, context={"request": request})
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
            ReviewPublicSerializer(review, context={"request": request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class MyReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        product_type = request.query_params.get("product_type")
        product_id = parse_uuid(
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


class ReviewReplyCreateView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ReviewWriteRateThrottle]

    def post(self, request: Request, review_id: UUID) -> Response:
        serializer = ReviewReplyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            review = Review.objects.get(pk=review_id, is_hidden=False)
        except Review.DoesNotExist as exc:
            raise NotFound(detail="Review not found.") from exc
        parent = None
        parent_id = serializer.validated_data.get("parent_id")
        if parent_id:
            try:
                parent = ReviewReply.objects.get(pk=parent_id, review=review)
            except ReviewReply.DoesNotExist as exc:
                raise ValidationError({"parent_id": ["Reply does not belong to this comment."]}) from exc
        reply = ReviewReply.objects.create(
            review=review,
            user=request.user,
            parent=parent,
            text=serializer.validated_data["text"],
        )
        return Response(ReviewReplySerializer(reply, context={"request": request}).data, status=status.HTTP_201_CREATED)


class ReviewReplyReactionView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ReviewWriteRateThrottle]

    def post(self, request: Request, reply_id: UUID) -> Response:
        serializer = ReviewReactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            reply = ReviewReply.objects.select_related("review").get(
                pk=reply_id,
                review__is_hidden=False,
            )
        except ReviewReply.DoesNotExist as exc:
            raise NotFound(detail="Reply not found.") from exc

        value = serializer.validated_data["value"]
        reaction, created = ReviewReplyReaction.objects.get_or_create(
            reply=reply,
            user=request.user,
            defaults={"value": value},
        )
        viewer_reaction = value
        if not created and reaction.value == value:
            reaction.delete()
            viewer_reaction = None
        elif not created:
            reaction.value = value
            reaction.save(update_fields=["value"])

        return Response({
            "like_count": reply.reactions.filter(value=ReviewReplyReaction.Value.LIKE).count(),
            "dislike_count": reply.reactions.filter(value=ReviewReplyReaction.Value.DISLIKE).count(),
            "viewer_reaction": viewer_reaction,
        })


class ReviewReactionView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ReviewWriteRateThrottle]

    def post(self, request: Request, review_id: UUID) -> Response:
        serializer = ReviewReactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            review = Review.objects.get(pk=review_id, is_hidden=False)
        except Review.DoesNotExist as exc:
            raise NotFound(detail="Review not found.") from exc
        value = serializer.validated_data["value"]
        reaction, created = ReviewReaction.objects.get_or_create(
            review=review, user=request.user, defaults={"value": value}
        )
        viewer_reaction = value
        if not created and reaction.value == value:
            reaction.delete()
            viewer_reaction = None
        elif not created:
            reaction.value = value
            reaction.save(update_fields=["value"])
        return Response({
            "like_count": review.reactions.filter(value=ReviewReaction.Value.LIKE).count(),
            "dislike_count": review.reactions.filter(value=ReviewReaction.Value.DISLIKE).count(),
            "viewer_reaction": viewer_reaction,
        })


class ReviewEligibilityView(APIView):
    """Return whether the authenticated user can review a catalog item."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        product_type = request.query_params.get("product_type")
        product_id = parse_uuid(
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
            existing = ReviewService.get_mine(request.user, normalized, product_id)
        except ReviewError as exc:
            return _error_response(exc)

        return Response(
            {
                "can_review": True,
                "can_rate": user_owns_catalog_item(request.user, normalized, product_id),
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
            product_id=parse_uuid(
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
