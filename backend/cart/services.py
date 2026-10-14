"""
Cart pricing policy (v1):
- Display and subtotal use live catalog effective prices:
  effective_price = discount_price if set else price.
- Prices are NOT snapshotted in the cart; checkout snapshots purchase_price
  on OrderItem via OrderService.create() / OrderService.create_from_cart().
- Unavailable catalog lines remain in the cart but are excluded from subtotal.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable
from uuid import UUID

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from cart.models import Cart, CartItem
from plugins.models import Plugin
from products.models import Product

User = get_user_model()

DEFAULT_CURRENCY = "USD"
ZERO = Decimal("0.00")


class CartError(Exception):
    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


@dataclass(frozen=True)
class CartTotals:
    subtotal: Decimal
    discount_amount: Decimal
    total: Decimal
    currency: str
    item_count: int
    total_quantity: int


@dataclass(frozen=True)
class CartEnvelope:
    cart: Cart
    items: list[CartItem]
    totals: CartTotals
    snapshots: dict[tuple[str, UUID], dict[str, Any] | None]


class CartService:
    @classmethod
    def get_or_create_cart(cls, user: User) -> Cart:
        cart, created = Cart.objects.get_or_create(user=user)
        if created:
            return cart
        return Cart.objects.get(pk=cart.pk)

    @classmethod
    def lock_cart(cls, user: User) -> Cart:
        """Lock the shared cart row before reading or changing its lines."""
        cart = cls.get_or_create_cart(user)
        return Cart.objects.select_for_update().get(pk=cart.pk)

    @classmethod
    def get_cart_envelope(cls, user: User) -> CartEnvelope:
        cart = cls.get_or_create_cart(user)
        items = list(cart.items.order_by("created_at"))
        snapshots = cls.build_catalog_snapshots(items)
        totals = cls._compute_totals(items, snapshots)
        return CartEnvelope(
            cart=cart,
            items=items,
            totals=totals,
            snapshots=snapshots,
        )

    @classmethod
    @transaction.atomic
    def add_item(
        cls,
        user: User,
        product_type: str,
        product_id: UUID,
        quantity: int = 1,
    ) -> tuple[CartItem, bool]:
        normalized_type = product_type.strip().lower()
        if normalized_type not in CartItem.ProductType.values:
            raise CartError("Invalid product type.", field="product_type")

        if quantity < 1 or quantity > CartItem.MAX_QUANTITY:
            raise CartError(
                f"Quantity must be between 1 and {CartItem.MAX_QUANTITY}.",
                field="quantity",
            )

        _, currency = cls._validate_catalog_item(normalized_type, product_id)
        cart = cls.lock_cart(user)
        cls._ensure_currency_consistency(cart, currency)

        item, created = CartItem.objects.get_or_create(
            cart=cart,
            product_type=normalized_type,
            product_id=product_id,
            defaults={"quantity": quantity},
        )
        if not created:
            new_quantity = item.quantity + quantity
            if new_quantity > CartItem.MAX_QUANTITY:
                raise CartError(
                    f"Quantity cannot exceed {CartItem.MAX_QUANTITY}.",
                    field="quantity",
                )
            item.quantity = new_quantity
            item.save(update_fields=["quantity", "updated_at"])

        return item, created

    @classmethod
    @transaction.atomic
    def update_quantity(cls, user: User, item_id: UUID, quantity: int) -> CartItem:
        if quantity < 1 or quantity > CartItem.MAX_QUANTITY:
            raise CartError(
                f"Quantity must be between 1 and {CartItem.MAX_QUANTITY}.",
                field="quantity",
            )

        cls.lock_cart(user)
        try:
            item = CartItem.objects.select_related("cart").get(
                pk=item_id,
                cart__user=user,
            )
        except CartItem.DoesNotExist as exc:
            raise CartError("Cart item not found.") from exc

        cls._validate_catalog_item(item.product_type, item.product_id)

        item.quantity = quantity
        item.save(update_fields=["quantity", "updated_at"])
        return item

    @classmethod
    @transaction.atomic
    def remove_item(cls, user: User, item_id: UUID) -> None:
        cls.lock_cart(user)
        try:
            item = CartItem.objects.get(pk=item_id, cart__user=user)
        except CartItem.DoesNotExist as exc:
            raise CartError("Cart item not found.") from exc
        item.delete()

    @classmethod
    @transaction.atomic
    def clear_cart(cls, user: User) -> None:
        cart = cls.lock_cart(user)
        cart.items.all().delete()

    @classmethod
    @transaction.atomic
    def remove_items(cls, user: User, keys: Iterable[tuple[str, UUID]], *, before=None) -> None:
        """Remove only the given (product_type, product_id) lines from the cart.

        Used after a successful checkout to drop just the purchased lines,
        leaving anything the customer added after starting checkout intact.
        """
        cart = cls.lock_cart(user)
        key_set = set(keys)
        if not key_set:
            return
        query = Q()
        for product_type, product_id in key_set:
            query |= Q(product_type=product_type, product_id=product_id)
        rows = cart.items.filter(query)
        if before is not None:
            rows = rows.filter(updated_at__lte=before)
        rows.delete()

    @classmethod
    def _ensure_currency_consistency(cls, cart: Cart, currency: str) -> None:
        items = list(cart.items.all())
        if not items:
            return

        snapshots = cls.build_catalog_snapshots(items)
        existing_currency = cls._resolve_cart_currency(items, snapshots)
        if existing_currency != currency:
            raise CartError(
                f"All cart items must use currency {existing_currency}.",
                field="product_id",
            )

    @classmethod
    def _resolve_cart_currency(
        cls,
        items: Iterable[CartItem],
        snapshots: dict[tuple[str, UUID], dict[str, Any] | None],
    ) -> str:
        for item in items:
            snapshot = snapshots.get((item.product_type, item.product_id))
            if snapshot and snapshot.get("currency"):
                return str(snapshot["currency"])
        return DEFAULT_CURRENCY

    @classmethod
    def _validate_catalog_item(
        cls,
        product_type: str,
        product_id: UUID,
    ) -> tuple[Decimal, str]:
        if product_type == CartItem.ProductType.PRODUCT:
            try:
                product = Product.objects.get(pk=product_id)
            except Product.DoesNotExist as exc:
                raise CartError("Product not found.", field="product_id") from exc
            if product.status != Product.Status.PUBLISHED:
                raise CartError(
                    "Product is not available for purchase.",
                    field="product_id",
                )
            effective_price = cls._effective_price(product.discount_price, product.price)
            return effective_price, product.currency

        try:
            plugin = Plugin.objects.select_related("category").get(pk=product_id)
        except Plugin.DoesNotExist as exc:
            raise CartError("Plugin not found.", field="product_id") from exc
        if plugin.status != Plugin.Status.PUBLISHED:
            raise CartError(
                "Plugin is not available for purchase.",
                field="product_id",
            )
        if not plugin.category.is_active:
            raise CartError(
                "Plugin is not available for purchase.",
                field="product_id",
            )
        effective_price = cls._effective_price(plugin.discount_price, plugin.price)
        return effective_price, plugin.currency

    @classmethod
    def _effective_price(
        cls,
        discount_price: Decimal | None,
        price: Decimal,
    ) -> Decimal:
        if discount_price is not None:
            return discount_price
        return price

    @classmethod
    def build_catalog_snapshots(
        cls,
        items: Iterable[CartItem],
    ) -> dict[tuple[str, UUID], dict[str, Any] | None]:
        product_ids = [
            item.product_id
            for item in items
            if item.product_type == CartItem.ProductType.PRODUCT
        ]
        plugin_ids = [
            item.product_id
            for item in items
            if item.product_type == CartItem.ProductType.PLUGIN
        ]

        snapshots: dict[tuple[str, UUID], dict[str, Any] | None] = {}

        if product_ids:
            products = Product.objects.select_related("category").filter(pk__in=product_ids)
            for product in products:
                snapshots[(CartItem.ProductType.PRODUCT, product.id)] = (
                    cls._product_snapshot(product)
                )

        if plugin_ids:
            plugins = Plugin.objects.select_related("category").filter(pk__in=plugin_ids)
            for plugin in plugins:
                snapshots[(CartItem.ProductType.PLUGIN, plugin.id)] = (
                    cls._plugin_snapshot(plugin)
                )

        return snapshots

    @classmethod
    def _product_snapshot(cls, product: Product) -> dict[str, Any]:
        effective_price = cls._effective_price(product.discount_price, product.price)
        return {
            "name": product.name,
            "slug": product.slug,
            "thumbnail": product.thumbnail,
            "price": f"{product.price:.2f}",
            "discount_price": (
                f"{product.discount_price:.2f}"
                if product.discount_price is not None
                else None
            ),
            "effective_price": f"{effective_price:.2f}",
            "currency": product.currency,
            "category": {
                "id": str(product.category_id),
                "name": product.category.name,
                "slug": product.category.slug,
            },
            "is_available": (
                product.status == Product.Status.PUBLISHED and product.category.is_active
            ),
        }

    @classmethod
    def _plugin_snapshot(cls, plugin: Plugin) -> dict[str, Any]:
        effective_price = cls._effective_price(plugin.discount_price, plugin.price)
        return {
            "name": plugin.name,
            "slug": plugin.slug,
            "thumbnail": plugin.thumbnail,
            "price": f"{plugin.price:.2f}",
            "discount_price": (
                f"{plugin.discount_price:.2f}"
                if plugin.discount_price is not None
                else None
            ),
            "effective_price": f"{effective_price:.2f}",
            "currency": plugin.currency,
            "category": {
                "id": str(plugin.category_id),
                "name": plugin.category.name,
                "slug": plugin.category.slug,
            },
            "is_available": (
                plugin.status == Plugin.Status.PUBLISHED and plugin.category.is_active
            ),
        }

    @classmethod
    def _compute_subtotal(
        cls,
        items: Iterable[CartItem],
        snapshots: dict[tuple[str, UUID], dict[str, Any] | None],
    ) -> Decimal:
        subtotal = Decimal("0.00")
        for item in items:
            snapshot = snapshots.get((item.product_type, item.product_id))
            if not snapshot or not snapshot.get("is_available"):
                continue
            effective_price = Decimal(snapshot["effective_price"])
            subtotal += effective_price * item.quantity
        return subtotal.quantize(Decimal("0.01"))

    @classmethod
    def _compute_totals(
        cls,
        items: Iterable[CartItem],
        snapshots: dict[tuple[str, UUID], dict[str, Any] | None],
    ) -> CartTotals:
        item_list = list(items)
        subtotal = cls._compute_subtotal(item_list, snapshots)
        total_quantity = sum(item.quantity for item in item_list)
        currency = cls._resolve_cart_currency(item_list, snapshots)
        return CartTotals(
            subtotal=subtotal,
            discount_amount=ZERO,
            total=subtotal,
            currency=currency,
            item_count=len(item_list),
            total_quantity=total_quantity,
        )

    @classmethod
    def get_item_line_total(
        cls,
        item: CartItem,
        snapshots: dict[tuple[str, UUID], dict[str, Any] | None],
    ) -> Decimal | None:
        snapshot = snapshots.get((item.product_type, item.product_id))
        if not snapshot or not snapshot.get("is_available"):
            return None
        effective_price = Decimal(snapshot["effective_price"])
        return (effective_price * item.quantity).quantize(Decimal("0.01"))

    @classmethod
    def get_item_unit_price(
        cls,
        item: CartItem,
        snapshots: dict[tuple[str, UUID], dict[str, Any] | None],
    ) -> str | None:
        snapshot = snapshots.get((item.product_type, item.product_id))
        if not snapshot:
            return None
        return snapshot.get("effective_price")
