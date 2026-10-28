from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Avg, Count, Q, QuerySet

from plugins.models import Plugin
from products.models import Product
from reviews.models import Review
from orders.entitlements import user_owns_catalog_item
User = get_user_model()

ALLOWED_PUBLIC_ORDERING = {
    "created_at",
    "-created_at",
    "rating",
    "-rating",
}
ALLOWED_ADMIN_ORDERING = ALLOWED_PUBLIC_ORDERING | {
    "updated_at",
    "-updated_at",
}
MAX_COMMENTS_PER_USER_PRODUCT = 5


class ReviewError(Exception):
    def __init__(
        self,
        message: str,
        field: str | None = None,
        *,
        code: str = "review_error",
        status_code: int = 400,
    ) -> None:
        self.message = message
        self.field = field
        self.code = code
        self.status_code = status_code
        super().__init__(message)


class ReviewService:
    @classmethod
    def list_public(
        cls,
        product_type: str,
        product_id: UUID,
        *,
        ordering: str = "-created_at",
    ) -> QuerySet[Review]:
        normalized_type = cls._normalize_product_type(product_type)
        cls._validate_catalog_item_exists(normalized_type, product_id)
        if ordering not in ALLOWED_PUBLIC_ORDERING:
            ordering = "-created_at"
        return (
            Review.objects.filter(
                product_type=normalized_type,
                product_id=product_id,
                is_hidden=False,
            )
            .select_related("user")
            .order_by(ordering)
        )

    @classmethod
    def list_admin(
        cls,
        *,
        product_type: str | None = None,
        product_id: UUID | None = None,
        is_hidden: bool | None = None,
        search: str | None = None,
        ordering: str = "-created_at",
    ) -> QuerySet[Review]:
        queryset = Review.objects.select_related("user").all()
        if product_type:
            queryset = queryset.filter(
                product_type=cls._normalize_product_type(product_type)
            )
        if product_id is not None:
            queryset = queryset.filter(product_id=product_id)
        if is_hidden is not None:
            queryset = queryset.filter(is_hidden=is_hidden)
        if search and search.strip():
            query = search.strip()[:100]
            queryset = queryset.filter(
                Q(review_text__icontains=query)
                | Q(user__email__icontains=query)
                | Q(user__full_name__icontains=query)
            )
        if ordering not in ALLOWED_ADMIN_ORDERING:
            ordering = "-created_at"
        return queryset.order_by(ordering)

    @classmethod
    def get_for_admin(cls, review_id: UUID) -> Review:
        try:
            return Review.objects.select_related("user").get(pk=review_id)
        except Review.DoesNotExist as exc:
            raise ReviewError("Review not found.", status_code=404) from exc

    @classmethod
    def get_mine(
        cls,
        user: User,
        product_type: str,
        product_id: UUID,
    ) -> Review | None:
        normalized_type = cls._normalize_product_type(product_type)
        return (
            Review.objects.filter(
                user=user,
                product_type=normalized_type,
                product_id=product_id,
            )
            .select_related("user")
            .first()
        )

    @classmethod
    def create_or_update(
        cls,
        user: User,
        *,
        product_type: str,
        product_id: UUID,
        rating: int | None,
        review_text: str = "",
    ) -> tuple[Review, bool]:
        if rating is not None and not (1 <= rating <= 5):
            raise ReviewError("Rating must be between 1 and 5.", field="rating")

        normalized_type = cls._normalize_product_type(product_type)
        cls._validate_catalog_item(normalized_type, product_id)

        if rating is not None and not user_owns_catalog_item(user, normalized_type, product_id):
            raise ReviewError(
                "Only verified purchasers can leave a star rating. You can still post a comment.",
                field="rating", code="not_purchased", status_code=403,
            )
        text = (review_text or "").strip()
        if rating is None and not text:
            raise ReviewError(
                "Write a comment or select a rating.",
                field="review_text",
            )
        if len(text) > 2000:
            raise ReviewError(
                "Review text must be at most 2000 characters.",
                field="review_text",
            )

        with transaction.atomic():
            if normalized_type == Review.ProductType.PRODUCT:
                Product.objects.select_for_update().get(pk=product_id)
            else:
                Plugin.objects.select_for_update().get(pk=product_id)

            comment_count = Review.objects.filter(
                user=user,
                product_type=normalized_type,
                product_id=product_id,
            ).count()
            if comment_count >= MAX_COMMENTS_PER_USER_PRODUCT:
                raise ReviewError(
                    "You can post a maximum of 5 comments on this product.",
                    field="review_text",
                    code="comment_limit_reached",
                )

            if rating is not None and Review.objects.filter(
                user=user,
                product_type=normalized_type,
                product_id=product_id,
                rating__isnull=False,
            ).exists():
                raise ReviewError(
                    "You have already rated this product.",
                    field="rating",
                    code="rating_already_submitted",
                )

            review = Review.objects.create(
                user=user,
                product_type=normalized_type,
                product_id=product_id,
                rating=rating,
                review_text=text,
            )
            cls._recompute_aggregates(normalized_type, product_id)
            review.refresh_from_db()
            return review, True

    @classmethod
    def set_hidden(cls, review: Review, hidden: bool) -> Review:
        with transaction.atomic():
            locked = Review.objects.select_for_update().get(pk=review.pk)
            locked.is_hidden = hidden
            locked.save(update_fields=["is_hidden", "updated_at"])
            cls._recompute_aggregates(locked.product_type, locked.product_id)
            return Review.objects.select_related("user").get(pk=locked.pk)

    @classmethod
    def delete(cls, review: Review) -> None:
        product_type = review.product_type
        product_id = review.product_id
        with transaction.atomic():
            Review.objects.filter(pk=review.pk).delete()
            cls._recompute_aggregates(product_type, product_id)

    @classmethod
    def build_catalog_titles(
        cls,
        reviews: list[Review] | QuerySet[Review],
    ) -> dict[tuple[str, UUID], dict[str, Any] | None]:
        items = list(reviews)
        product_ids = [
            item.product_id
            for item in items
            if item.product_type == Review.ProductType.PRODUCT
        ]
        plugin_ids = [
            item.product_id
            for item in items
            if item.product_type == Review.ProductType.PLUGIN
        ]
        titles: dict[tuple[str, UUID], dict[str, Any] | None] = {}
        if product_ids:
            for product in Product.objects.filter(pk__in=product_ids).only(
                "id", "name", "slug"
            ):
                titles[(Review.ProductType.PRODUCT, product.id)] = {
                    "name": product.name,
                    "slug": product.slug,
                }
        if plugin_ids:
            for plugin in Plugin.objects.filter(pk__in=plugin_ids).only(
                "id", "name", "slug"
            ):
                titles[(Review.ProductType.PLUGIN, plugin.id)] = {
                    "name": plugin.name,
                    "slug": plugin.slug,
                }
        return titles

    @classmethod
    def _recompute_aggregates(cls, product_type: str, product_id: UUID) -> None:
        stats = Review.objects.filter(
            product_type=product_type,
            product_id=product_id,
            is_hidden=False,
        ).aggregate(
            review_count=Count("rating"),
            average_rating=Avg("rating"),
        )
        count = int(stats["review_count"] or 0)
        average = (
            Decimal("0.00")
            if count == 0 or stats["average_rating"] is None
            else Decimal(str(stats["average_rating"])).quantize(Decimal("0.01"))
        )

        if product_type == Review.ProductType.PRODUCT:
            Product.objects.filter(pk=product_id).update(
                average_rating=average,
                review_count=count,
            )
            return

        Plugin.objects.filter(pk=product_id).update(
            average_rating=average,
            review_count=count,
        )

    @classmethod
    def _normalize_product_type(cls, product_type: str) -> str:
        normalized = (product_type or "").strip().lower()
        if normalized not in Review.ProductType.values:
            raise ReviewError("Invalid product type.", field="product_type")
        return normalized

    @classmethod
    def _validate_catalog_item_exists(
        cls,
        product_type: str,
        product_id: UUID,
    ) -> None:
        if product_type == Review.ProductType.PRODUCT:
            if not Product.objects.filter(pk=product_id).exists():
                raise ReviewError("Product not found.", field="product_id", status_code=404)
            return
        if not Plugin.objects.filter(pk=product_id).exists():
            raise ReviewError("Plugin not found.", field="product_id", status_code=404)

    @classmethod
    def _validate_catalog_item(cls, product_type: str, product_id: UUID) -> None:
        if product_type == Review.ProductType.PRODUCT:
            try:
                product = Product.objects.get(pk=product_id)
            except Product.DoesNotExist as exc:
                raise ReviewError(
                    "Product not found.",
                    field="product_id",
                    status_code=404,
                ) from exc
            if product.status != Product.Status.PUBLISHED:
                raise ReviewError(
                    "Product is not available for review.",
                    field="product_id",
                )
            return

        try:
            plugin = Plugin.objects.select_related("category").get(pk=product_id)
        except Plugin.DoesNotExist as exc:
            raise ReviewError(
                "Plugin not found.",
                field="product_id",
                status_code=404,
            ) from exc
        if plugin.status != Plugin.Status.PUBLISHED:
            raise ReviewError(
                "Plugin is not available for review.",
                field="product_id",
            )
        if not plugin.category.is_active:
            raise ReviewError(
                "Plugin is not available for review.",
                field="product_id",
            )
