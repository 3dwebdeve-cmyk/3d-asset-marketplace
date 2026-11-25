"""
Cart pricing policy (v1):
- A model is sold per package (docs/PACKAGES_PIPELINE.md): each cart line is one package of
  one model, priced by that package's effective price (the running sale price, else the
  price; an ended sale is ignored). Plugins: discount_price if set else price.
- All variations (BUNDLE_KIND) is one line for every package the buyer does not own yet, at
  BUNDLE_DISCOUNT_PERCENT off, priced by products.packages.bundle_quote. It replaces the
  model's single-package lines in the cart, and a single package replaces it.
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
from django.utils import timezone
from cart.models import Cart, CartItem
from plugins.models import Plugin
from products.models import Product, ProductFile
from products.packages import (
    BUNDLE_KIND,
    LINE_KINDS,
    PACKAGE_LABELS,
    SINGLE_KINDS,
    bundle_quote,
    line_title,
)

User = get_user_model()

DEFAULT_CURRENCY = "USD"
ZERO = Decimal("0.00")

# One cart (or order) line: (product_type, product_id, package_kind); the kind is blank for a
# plugin.
LineKey = tuple[str, UUID, str]


def line_key(item) -> LineKey:
    """The key of a cart or order line."""
    return (item.product_type, item.product_id, item.package_kind)


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
    snapshots: dict[LineKey, dict[str, Any] | None]


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
        from orders.entitlements import owned_package_kinds

        owned = owned_package_kinds(
            user,
            {item.product_id for item in items if item.product_type == CartItem.ProductType.PRODUCT},
        )
        snapshots = cls.build_catalog_snapshots(items, owned=owned)
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
        package_kind: str = "",
        quantity: int = 1,
    ) -> tuple[CartItem, bool]:
        normalized_type = product_type.strip().lower()
        if normalized_type not in CartItem.ProductType.values:
            raise CartError("Invalid product type.", field="product_type")
        package_kind = (package_kind or "").strip()
        if normalized_type == CartItem.ProductType.PLUGIN and package_kind:
            raise CartError("A plugin has no packages.", field="package_kind")

        if quantity < 1 or quantity > CartItem.MAX_QUANTITY:
            raise CartError(
                f"Quantity must be between 1 and {CartItem.MAX_QUANTITY}.",
                field="quantity",
            )
        if package_kind == BUNDLE_KIND and quantity != 1:
            raise CartError("All variations is bought once: its quantity is 1.", field="quantity")

        owned = (
            cls.owned_kinds(user, product_id)
            if normalized_type == CartItem.ProductType.PRODUCT
            else frozenset()
        )
        _, currency = cls._validate_catalog_item(normalized_type, product_id, package_kind, owned=owned)
        from orders.entitlements import owned_line_keys

        # Digital items are bought once; the download stays available.
        if owned_line_keys(user, [(normalized_type, product_id, package_kind)]):
            raise CartError(
                "You already own this. Download it from Dashboard → Downloads.",
                field="product_id",
            )
        cart = cls.lock_cart(user)
        cls._ensure_currency_consistency(cart, currency)
        cls._replace_overlapping_lines(cart, normalized_type, product_id, package_kind)

        item, created = CartItem.objects.get_or_create(
            cart=cart,
            product_type=normalized_type,
            product_id=product_id,
            package_kind=package_kind,
            defaults={"quantity": quantity},
        )
        if not created and package_kind == BUNDLE_KIND:
            # All variations is bought once: adding it again changes nothing.
            return item, False
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

        if item.package_kind == BUNDLE_KIND and quantity != 1:
            raise CartError("All variations is bought once: its quantity is 1.", field="quantity")
        owned = (
            cls.owned_kinds(user, item.product_id)
            if item.product_type == CartItem.ProductType.PRODUCT
            else frozenset()
        )
        cls._validate_catalog_item(item.product_type, item.product_id, item.package_kind, owned=owned)

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
    def remove_items(cls, user: User, keys: Iterable[LineKey], *, before=None) -> None:
        """Remove only the given lines from the cart.

        Used after a successful checkout to drop just the purchased lines,
        leaving anything the customer added after starting checkout intact.
        """
        cart = cls.lock_cart(user)
        key_set = set(keys)
        if not key_set:
            return
        query = Q()
        for product_type, product_id, package_kind in key_set:
            query |= Q(product_type=product_type, product_id=product_id, package_kind=package_kind)
        rows = cart.items.filter(query)
        if before is not None:
            rows = rows.filter(updated_at__lte=before)
        rows.delete()

    @classmethod
    def owned_kinds(cls, user: User, product_id: UUID) -> frozenset[str]:
        from orders.entitlements import owned_package_kinds

        return owned_package_kinds(user, [product_id]).get(product_id, frozenset())

    @classmethod
    def _replace_overlapping_lines(
        cls, cart: Cart, product_type: str, product_id: UUID, package_kind: str
    ) -> None:
        """All variations and a single package of one model are never in the cart together:
        the buyer's latest pick wins."""
        if product_type != CartItem.ProductType.PRODUCT:
            return
        same_model = cart.items.filter(product_type=product_type, product_id=product_id)
        if package_kind == BUNDLE_KIND:
            same_model.filter(package_kind__in=SINGLE_KINDS).delete()
        elif package_kind in SINGLE_KINDS:
            same_model.filter(package_kind=BUNDLE_KIND).delete()

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
        snapshots: dict[LineKey, dict[str, Any] | None],
    ) -> str:
        for item in items:
            snapshot = snapshots.get(line_key(item))
            if snapshot and snapshot.get("currency"):
                return str(snapshot["currency"])
        return DEFAULT_CURRENCY

    @classmethod
    def _validate_catalog_item(
        cls,
        product_type: str,
        product_id: UUID,
        package_kind: str,
        owned: frozenset[str] = frozenset(),
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
            if product.is_free:
                raise CartError(
                    "This model is free. Use Download on its page; it needs no checkout.",
                    field="product_id",
                )
            if package_kind not in LINE_KINDS:
                raise CartError("Choose a package of this model.", field="package_kind")
            if package_kind == BUNDLE_KIND:
                quote = bundle_quote(product.files.all(), owned, now=timezone.now())
                if not quote.eligible:
                    raise CartError(
                        f"All variations is not available for this model: {quote.reason}",
                        field="package_kind",
                    )
                return quote.price, product.currency
            package = ProductFile.objects.filter(
                product=product, is_preview=False, package_kind=package_kind
            ).first()
            if package is None or package.price is None:
                # A package with no price yet is not sold.
                raise CartError(
                    f"The {PACKAGE_LABELS[package_kind]} package of this model is not for sale.",
                    field="package_kind",
                )
            return package.effective_price(), product.currency

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
        owned: dict[UUID, frozenset[str]] | None = None,
    ) -> dict[LineKey, dict[str, Any] | None]:
        """The price and availability of every line. ``owned`` says which packages the buyer
        already owns of each model; it prices All variations for that buyer."""
        items = list(items)
        owned = owned or {}
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

        snapshots: dict[LineKey, dict[str, Any] | None] = {}

        if product_ids:
            # One clock reading for the whole cart, so every line agrees on which sales run.
            now = timezone.now()
            products = {
                product.id: product
                for product in Product.objects.select_related("category")
                .prefetch_related("files")
                .filter(pk__in=product_ids)
            }
            for item in items:
                product = products.get(item.product_id)
                if item.product_type != CartItem.ProductType.PRODUCT or product is None:
                    continue
                if item.package_kind == BUNDLE_KIND:
                    snapshots[line_key(item)] = cls._bundle_snapshot(
                        product, owned.get(product.id, frozenset()), now=now
                    )
                    continue
                package = next(
                    (
                        row
                        for row in product.files.all()
                        if not row.is_preview and row.package_kind and row.package_kind == item.package_kind
                    ),
                    None,
                )
                snapshots[line_key(item)] = (
                    cls._product_snapshot(product, package, now=now) if package else None
                )

        if plugin_ids:
            plugins = Plugin.objects.select_related("category").filter(pk__in=plugin_ids)
            for plugin in plugins:
                snapshots[(CartItem.ProductType.PLUGIN, plugin.id, "")] = (
                    cls._plugin_snapshot(plugin)
                )

        return snapshots

    @classmethod
    def _bundle_snapshot(cls, product: Product, owned: frozenset[str], *, now) -> dict[str, Any]:
        """The All variations line: the packages the buyer does not own, at the bundle price."""
        quote = bundle_quote(product.files.all(), owned, now=now)
        return {
            "name": product.name,
            "title": line_title(product.name, BUNDLE_KIND),
            "package_kind": BUNDLE_KIND,
            "package_label": PACKAGE_LABELS[BUNDLE_KIND],
            "slug": product.slug,
            "thumbnail": product.thumbnail,
            "price": f"{quote.subtotal:.2f}",
            "discount_price": f"{quote.price:.2f}",
            "effective_price": f"{quote.price:.2f}",
            "currency": product.currency,
            "category": {
                "id": str(product.category_id),
                "name": product.category.name,
                "slug": product.category.slug,
            },
            "is_available": (
                product.status == Product.Status.PUBLISHED
                and product.category.is_active
                and not product.is_free
                and quote.eligible
            ),
        }

    @classmethod
    def _product_snapshot(cls, product: Product, package: ProductFile, *, now=None) -> dict[str, Any]:
        now = now or timezone.now()
        sale_price = package.active_discount_price(now)
        effective_price = package.effective_price(now)
        return {
            "name": product.name,
            "title": line_title(product.name, package.package_kind),
            "package_kind": package.package_kind,
            "package_label": PACKAGE_LABELS[package.package_kind],
            "slug": product.slug,
            "thumbnail": product.thumbnail,
            "price": f"{package.price:.2f}" if package.price is not None else None,
            # The running sale price only; an ended sale is not shown or charged.
            "discount_price": f"{sale_price:.2f}" if sale_price is not None else None,
            "effective_price": f"{effective_price:.2f}" if effective_price is not None else None,
            "currency": product.currency,
            "category": {
                "id": str(product.category_id),
                "name": product.category.name,
                "slug": product.category.slug,
            },
            # A model made free after it was added is downloaded, not checked out; a package
            # whose price was removed is not sold.
            "is_available": (
                product.status == Product.Status.PUBLISHED
                and product.category.is_active
                and not product.is_free
                and package.price is not None
            ),
        }

    @classmethod
    def _plugin_snapshot(cls, plugin: Plugin) -> dict[str, Any]:
        effective_price = cls._effective_price(plugin.discount_price, plugin.price)
        return {
            "name": plugin.name,
            "title": plugin.name,
            "package_kind": "",
            "package_label": "",
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
        snapshots: dict[LineKey, dict[str, Any] | None],
    ) -> Decimal:
        subtotal = Decimal("0.00")
        for item in items:
            snapshot = snapshots.get(line_key(item))
            if not snapshot or not snapshot.get("is_available"):
                continue
            effective_price = Decimal(snapshot["effective_price"])
            subtotal += effective_price * item.quantity
        return subtotal.quantize(Decimal("0.01"))

    @classmethod
    def _compute_totals(
        cls,
        items: Iterable[CartItem],
        snapshots: dict[LineKey, dict[str, Any] | None],
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
        snapshots: dict[LineKey, dict[str, Any] | None],
    ) -> Decimal | None:
        snapshot = snapshots.get(line_key(item))
        if not snapshot or not snapshot.get("is_available"):
            return None
        effective_price = Decimal(snapshot["effective_price"])
        return (effective_price * item.quantity).quantize(Decimal("0.01"))

    @classmethod
    def get_item_unit_price(
        cls,
        item: CartItem,
        snapshots: dict[LineKey, dict[str, Any] | None],
    ) -> str | None:
        snapshot = snapshots.get(line_key(item))
        if not snapshot:
            return None
        return snapshot.get("effective_price")
