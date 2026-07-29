from __future__ import annotations

from typing import Any, Iterable
from uuid import UUID

from django.contrib.auth import get_user_model
from django.db.models import QuerySet

from plugins.models import Plugin
from products.models import Product
from wishlist.models import WishlistItem

User = get_user_model()


class WishlistError(Exception):
    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


class WishlistService:
    @classmethod
    def list_for_user(
        cls,
        user: User,
        *,
        product_type: str | None = None,
        ordering: str = "-created_at",
    ) -> QuerySet[WishlistItem]:
        queryset = WishlistItem.objects.filter(user=user)
        if product_type:
            normalized = product_type.strip().lower()
            if normalized not in WishlistItem.ProductType.values:
                raise WishlistError("Invalid product type.", field="product_type")
            queryset = queryset.filter(product_type=normalized)

        allowed_ordering = {"created_at", "-created_at", "updated_at", "-updated_at"}
        if ordering not in allowed_ordering:
            ordering = "-created_at"
        return queryset.order_by(ordering)

    @classmethod
    def add(
        cls,
        user: User,
        product_type: str,
        product_id: UUID,
    ) -> tuple[WishlistItem, bool]:
        normalized_type = product_type.strip().lower()
        if normalized_type not in WishlistItem.ProductType.values:
            raise WishlistError("Invalid product type.", field="product_type")

        cls._validate_catalog_item(normalized_type, product_id)

        item, created = WishlistItem.objects.get_or_create(
            user=user,
            product_type=normalized_type,
            product_id=product_id,
        )
        return item, created

    @classmethod
    def remove(cls, user: User, item_id: UUID) -> None:
        try:
            item = WishlistItem.objects.get(pk=item_id, user=user)
        except WishlistItem.DoesNotExist as exc:
            raise WishlistError("Wishlist item not found.") from exc
        item.delete()

    @classmethod
    def _validate_catalog_item(cls, product_type: str, product_id: UUID) -> None:
        if product_type == WishlistItem.ProductType.PRODUCT:
            try:
                product = Product.objects.get(pk=product_id)
            except Product.DoesNotExist as exc:
                raise WishlistError("Product not found.", field="product_id") from exc
            if product.status != Product.Status.PUBLISHED:
                raise WishlistError(
                    "Product is not available to wishlist.",
                    field="product_id",
                )
            return

        try:
            plugin = Plugin.objects.select_related("category").get(pk=product_id)
        except Plugin.DoesNotExist as exc:
            raise WishlistError("Plugin not found.", field="product_id") from exc
        if plugin.status != Plugin.Status.PUBLISHED:
            raise WishlistError(
                "Plugin is not available to wishlist.",
                field="product_id",
            )
        if not plugin.category.is_active:
            raise WishlistError(
                "Plugin is not available to wishlist.",
                field="product_id",
            )

    @classmethod
    def build_catalog_snapshots(
        cls,
        items: Iterable[WishlistItem],
    ) -> dict[tuple[str, UUID], dict[str, Any] | None]:
        product_ids = [
            item.product_id
            for item in items
            if item.product_type == WishlistItem.ProductType.PRODUCT
        ]
        plugin_ids = [
            item.product_id
            for item in items
            if item.product_type == WishlistItem.ProductType.PLUGIN
        ]

        snapshots: dict[tuple[str, UUID], dict[str, Any] | None] = {}

        if product_ids:
            products = Product.objects.select_related("category").filter(pk__in=product_ids)
            for product in products:
                snapshots[(WishlistItem.ProductType.PRODUCT, product.id)] = (
                    cls._product_snapshot(product)
                )

        if plugin_ids:
            plugins = Plugin.objects.select_related("category").filter(pk__in=plugin_ids)
            for plugin in plugins:
                snapshots[(WishlistItem.ProductType.PLUGIN, plugin.id)] = (
                    cls._plugin_snapshot(plugin)
                )

        return snapshots

    @classmethod
    def _product_snapshot(cls, product: Product) -> dict[str, Any]:
        return {
            "name": product.name,
            "slug": product.slug,
            "short_description": product.short_description,
            "thumbnail": product.thumbnail,
            "price": f"{product.price:.2f}",
            "discount_price": (
                f"{product.discount_price:.2f}"
                if product.discount_price is not None
                else None
            ),
            "currency": product.currency,
            "license_type": product.license_type,
            "average_rating": f"{product.average_rating:.2f}",
            "category": {
                "id": str(product.category_id),
                "name": product.category.name,
                "slug": product.category.slug,
            },
            "is_available": product.status == Product.Status.PUBLISHED,
        }

    @classmethod
    def _plugin_snapshot(cls, plugin: Plugin) -> dict[str, Any]:
        return {
            "name": plugin.name,
            "slug": plugin.slug,
            "short_description": plugin.short_description,
            "thumbnail": plugin.thumbnail,
            "price": f"{plugin.price:.2f}",
            "discount_price": (
                f"{plugin.discount_price:.2f}"
                if plugin.discount_price is not None
                else None
            ),
            "currency": plugin.currency,
            "license_type": plugin.license_type,
            "average_rating": f"{plugin.average_rating:.2f}",
            "version": plugin.version,
            "compatibility": plugin.compatibility,
            "category": {
                "id": str(plugin.category_id),
                "name": plugin.category.name,
                "slug": plugin.category.slug,
            },
            "is_available": (
                plugin.status == Plugin.Status.PUBLISHED and plugin.category.is_active
            ),
        }
