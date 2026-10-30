from __future__ import annotations

import secrets
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from collections.abc import Iterable

from django.db import IntegrityError, transaction
from django.db.models import Count, Q, QuerySet
from django.utils import timezone

from accounts.models import User
from orders.models import Order, OrderItem
from plugins.models import Plugin
from products.models import Product


class OrderError(Exception):
    def __init__(self, message: str, field: str | None = None) -> None:
        self.message = message
        self.field = field
        super().__init__(message)


ALLOWED_ORDER_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    Order.OrderStatus.PENDING: frozenset(
        {
            Order.OrderStatus.PAID,
            Order.OrderStatus.CANCELLED,
        }
    ),
    Order.OrderStatus.PAID: frozenset({Order.OrderStatus.REFUNDED}),
    Order.OrderStatus.CANCELLED: frozenset(),
    Order.OrderStatus.REFUNDED: frozenset(),
}

ALLOWED_PAYMENT_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    Order.PaymentStatus.PENDING: frozenset(
        {
            Order.PaymentStatus.PAID,
            Order.PaymentStatus.CANCELLED,
        }
    ),
    Order.PaymentStatus.PAID: frozenset({Order.PaymentStatus.REFUNDED}),
    Order.PaymentStatus.CANCELLED: frozenset(),
    Order.PaymentStatus.REFUNDED: frozenset(),
}

ALLOWED_ORDERING = frozenset(
    {
        "created_at",
        "-created_at",
        "updated_at",
        "-updated_at",
        "total_amount",
        "-total_amount",
        "invoice_number",
        "-invoice_number",
        "order_status",
        "-order_status",
        "payment_status",
        "-payment_status",
    }
)

ALLOWED_CUSTOMER_ITEM_TYPES = frozenset({"catalog", "custom_project"})
CATALOG_PRODUCT_TYPES = frozenset(
    {
        OrderItem.ProductType.PRODUCT,
        OrderItem.ProductType.PLUGIN,
    }
)


@dataclass(frozen=True)
class OrderItemCreateData:
    product_type: str
    product_id: UUID
    quantity: int


@dataclass(frozen=True)
class OrderCreateData:
    user_id: UUID
    items: tuple[OrderItemCreateData, ...]
    currency: str = "USD"


class OrderService:
    @classmethod
    def get_detail_queryset(cls) -> QuerySet[Order]:
        return Order.objects.select_related("user").prefetch_related("items")

    @classmethod
    def get(cls, order_id: UUID) -> Order:
        try:
            return cls.get_detail_queryset().get(pk=order_id)
        except Order.DoesNotExist as exc:
            raise OrderError("Order not found.") from exc

    @classmethod
    def list_admin(
        cls,
        *,
        order_status: str | None = None,
        payment_status: str | None = None,
        customer_id: UUID | None = None,
        search: str | None = None,
        ordering: str = "-created_at",
    ) -> QuerySet[Order]:
        queryset = Order.objects.select_related("user").annotate(
            item_count=Count("items")
        )
        if order_status:
            queryset = queryset.filter(order_status=order_status)
        if payment_status:
            queryset = queryset.filter(payment_status=payment_status)
        if customer_id:
            queryset = queryset.filter(user_id=customer_id)
        if search and search.strip():
            query = search.strip()[:100]
            # A license code from a leaked certificate leads straight to its order.
            queryset = queryset.filter(
                Q(invoice_number__icontains=query)
                | Q(user__email__icontains=query)
                | Q(items__license_code=query.upper())
            ).distinct()
        if ordering not in ALLOWED_ORDERING:
            ordering = "-created_at"
        return queryset.order_by(ordering)

    @classmethod
    def list_for_user(
        cls,
        user: User,
        *,
        order_status: str | None = None,
        payment_status: str | None = None,
        search: str | None = None,
        ordering: str = "-created_at",
        item_type: str | None = None,
    ) -> QuerySet[Order]:
        queryset = Order.objects.filter(user=user).annotate(
            item_count=Count("items", distinct=True)
        )
        if order_status:
            queryset = queryset.filter(order_status=order_status)
        if payment_status:
            queryset = queryset.filter(payment_status=payment_status)
        if item_type == "catalog":
            queryset = queryset.filter(
                items__product_type__in=CATALOG_PRODUCT_TYPES
            ).distinct()
        elif item_type == "custom_project":
            queryset = queryset.filter(
                items__product_type=OrderItem.ProductType.CUSTOM_PROJECT
            ).distinct()
        if search and search.strip():
            query = search.strip()[:100]
            queryset = queryset.filter(invoice_number__icontains=query)
        if ordering not in ALLOWED_ORDERING:
            ordering = "-created_at"
        return queryset.order_by(ordering)

    @classmethod
    def get_for_user(cls, order_id: UUID, user: User) -> Order:
        try:
            return cls.get_detail_queryset().get(pk=order_id, user=user)
        except Order.DoesNotExist as exc:
            raise OrderError("Order not found.") from exc

    @classmethod
    def build_catalog_snapshots(
        cls,
        items: Iterable[OrderItem],
    ) -> dict[tuple[str, UUID], tuple[str | None, str | None]]:
        """Live lookup fallback for title/slug when OrderItem snapshots are null."""
        product_ids = [
            item.product_id
            for item in items
            if item.product_type == OrderItem.ProductType.PRODUCT
            and (not item.title or not item.slug)
        ]
        plugin_ids = [
            item.product_id
            for item in items
            if item.product_type == OrderItem.ProductType.PLUGIN
            and (not item.title or not item.slug)
        ]
        snapshots: dict[tuple[str, UUID], tuple[str | None, str | None]] = {}
        if product_ids:
            for product in Product.objects.filter(pk__in=product_ids).only(
                "id", "name", "slug"
            ):
                snapshots[(OrderItem.ProductType.PRODUCT, product.id)] = (
                    product.name,
                    product.slug,
                )
        if plugin_ids:
            for plugin in Plugin.objects.filter(pk__in=plugin_ids).only(
                "id", "name", "slug"
            ):
                snapshots[(OrderItem.ProductType.PLUGIN, plugin.id)] = (
                    plugin.name,
                    plugin.slug,
                )
        return snapshots

    @classmethod
    def build_catalog_titles(
        cls,
        items: Iterable[OrderItem],
    ) -> dict[tuple[str, UUID], str | None]:
        """Live title fallback for line items missing a snapshotted title."""
        return {
            key: title
            for key, (title, _slug) in cls.build_catalog_snapshots(items).items()
        }

    @classmethod
    def create(cls, data: OrderCreateData) -> Order:
        user = cls._require_user(data.user_id)
        if not data.items:
            raise OrderError("At least one order item is required.", field="items")

        currency = (data.currency or "USD").strip().upper()[:3]
        resolved_items: list[tuple[str, UUID, int, Decimal, str, str]] = []
        seen_keys: set[tuple[str, UUID]] = set()

        for index, item in enumerate(data.items):
            if item.quantity < 1:
                raise OrderError(
                    "Quantity must be at least 1.",
                    field=f"items[{index}].quantity",
                )
            product_type = item.product_type.strip().lower()
            if product_type not in OrderItem.ProductType.values:
                raise OrderError(
                    "Invalid product type.",
                    field=f"items[{index}].product_type",
                )
            key = (product_type, item.product_id)
            if key in seen_keys:
                raise OrderError(
                    "Duplicate line items are not allowed.",
                    field=f"items[{index}]",
                )
            seen_keys.add(key)

            purchase_price, item_currency, title, slug = cls._resolve_catalog_item(
                product_type,
                item.product_id,
                field_prefix=f"items[{index}]",
            )
            if item_currency != currency:
                raise OrderError(
                    f"All items must use currency {currency}.",
                    field=f"items[{index}].product_id",
                )
            resolved_items.append(
                (
                    product_type,
                    item.product_id,
                    item.quantity,
                    purchase_price,
                    title,
                    slug,
                )
            )

        total_amount = sum(
            (
                purchase_price * quantity
                for _, _, quantity, purchase_price, _, _ in resolved_items
            ),
            start=Decimal("0.00"),
        )

        with transaction.atomic():
            order = cls._create_order_with_unique_invoice(
                user=user,
                total_amount=total_amount,
                currency=currency,
            )
            OrderItem.objects.bulk_create(
                [
                    OrderItem(
                        order=order,
                        product_type=product_type,
                        product_id=product_id,
                        title=title,
                        slug=slug,
                        quantity=quantity,
                        purchase_price=purchase_price,
                    )
                    for (
                        product_type,
                        product_id,
                        quantity,
                        purchase_price,
                        title,
                        slug,
                    ) in resolved_items
                ]
            )

        return cls.get(order.pk)

    @classmethod
    @transaction.atomic
    def create_from_cart(
        cls, user: User, *, reuse_pending: bool = False, selected=None
    ) -> Order:
        """Snapshot the user's cart into a PENDING order for checkout.

        Only available cart lines are included (mirrors CartService totals).
        `selected`, a set of (product_type, product_id), limits the order to those lines;
        the rest stay in the cart.
        """
        from cart.services import CartService

        from orders.entitlements import owned_catalog_keys

        cart = CartService.lock_cart(user)
        # Owned since it was added (another tab, an earlier checkout, a free claim):
        # drop it from the cart so it is never charged twice and never blocks checkout.
        owned = owned_catalog_keys(user, list(cart.items.values_list("product_type", "product_id")))
        for product_type, product_id in owned:
            cart.items.filter(product_type=product_type, product_id=product_id).delete()
        envelope = CartService.get_cart_envelope(user)
        available_items = [
            item
            for item in envelope.items
            if (snapshot := envelope.snapshots.get((item.product_type, item.product_id)))
            and snapshot.get("is_available")
            and (selected is None or (item.product_type, item.product_id) in selected)
        ]
        if not available_items:
            raise OrderError("Your cart is empty.", field="items")
        totals = CartService._compute_totals(available_items, envelope.snapshots)

        resolved_items = [
            (
                item.product_type,
                item.product_id,
                item.quantity,
                Decimal(
                    envelope.snapshots[(item.product_type, item.product_id)][
                        "effective_price"
                    ]
                ),
                str(
                    envelope.snapshots[(item.product_type, item.product_id)].get("name")
                    or ""
                ),
                str(
                    envelope.snapshots[(item.product_type, item.product_id)].get("slug")
                    or ""
                ),
            )
            for item in available_items
        ]

        if reuse_pending:
            from datetime import timedelta
            from django.utils import timezone

            expected = {(kind, pk, qty, price) for kind, pk, qty, price, title, slug in resolved_items}
            # Stripe drops idempotency keys after 24 hours. Reusing an older
            # attempt blocks checkout instead of starting a new session.
            fresh_attempt_after = timezone.now() - timedelta(hours=23)
            candidates = Order.objects.filter(
                user=user, order_status=Order.OrderStatus.PENDING,
                payment_status=Order.PaymentStatus.PENDING,
                total_amount=totals.total, currency=totals.currency,
            ).filter(
                Q(
                    checkout_attempt__status__in=['prepared', 'ready', 'review'],
                    checkout_attempt__created_at__gte=fresh_attempt_after,
                )
                | Q(created_at__gte=timezone.now() - timedelta(minutes=25), payment__status="pending")
            ).prefetch_related("items").order_by("-created_at")[:10]
            for candidate in candidates:
                actual = {(item.product_type, item.product_id, item.quantity, item.purchase_price)
                          for item in candidate.items.all()}
                if actual == expected:
                    return cls.get(candidate.pk)

        order = cls._create_order_with_unique_invoice(
            user=user,
            total_amount=totals.total,
            currency=totals.currency,
        )
        OrderItem.objects.bulk_create(
            [
                OrderItem(
                    order=order,
                    product_type=product_type,
                    product_id=product_id,
                    title=title or None,
                    slug=slug or None,
                    quantity=quantity,
                    purchase_price=purchase_price,
                )
                for (
                    product_type,
                    product_id,
                    quantity,
                    purchase_price,
                    title,
                    slug,
                ) in resolved_items
            ]
        )

        return cls.get(order.pk)

    @classmethod
    def _create_order_with_unique_invoice(
        cls,
        *,
        user: User,
        total_amount: Decimal,
        currency: str,
    ) -> Order:
        for _attempt in range(5):
            invoice_number = cls._generate_invoice_number()
            try:
                # A collision must roll back to a savepoint before the next
                # attempt; otherwise PostgreSQL leaves the outer transaction
                # unusable until rollback.
                with transaction.atomic():
                    return Order.objects.create(
                        user=user,
                        invoice_number=invoice_number,
                        total_amount=total_amount,
                        currency=currency,
                        order_status=Order.OrderStatus.PENDING,
                        payment_status=Order.PaymentStatus.PENDING,
                    )
            except IntegrityError:
                if _attempt == 4:
                    raise OrderError(
                        "Unable to generate a unique invoice number.",
                    ) from None
        raise OrderError("Unable to generate a unique invoice number.")

    @classmethod
    def update_order_status(cls, order: Order, new_status: str) -> Order:
        cls._apply_status_transition(
            current=order.order_status,
            new_status=new_status,
            allowed=ALLOWED_ORDER_STATUS_TRANSITIONS,
            valid_values=Order.OrderStatus.values,
            field="order_status",
        )
        with transaction.atomic():
            locked = Order.objects.select_for_update().get(pk=order.pk)
            cls._apply_status_transition(
                current=locked.order_status,
                new_status=new_status,
                allowed=ALLOWED_ORDER_STATUS_TRANSITIONS,
                valid_values=Order.OrderStatus.values,
                field="order_status",
            )
            if locked.order_status != new_status:
                locked.order_status = new_status
                locked.save(update_fields=["order_status", "updated_at"])
            order_id = locked.pk
        return cls.get(order_id)

    @classmethod
    def update_payment_status(cls, order: Order, new_status: str) -> Order:
        cls._apply_status_transition(
            current=order.payment_status,
            new_status=new_status,
            allowed=ALLOWED_PAYMENT_STATUS_TRANSITIONS,
            valid_values=Order.PaymentStatus.values,
            field="payment_status",
        )
        with transaction.atomic():
            locked = Order.objects.select_for_update().get(pk=order.pk)
            cls._apply_status_transition(
                current=locked.payment_status,
                new_status=new_status,
                allowed=ALLOWED_PAYMENT_STATUS_TRANSITIONS,
                valid_values=Order.PaymentStatus.values,
                field="payment_status",
            )
            locked.payment_status = new_status
            locked.save(update_fields=["payment_status", "updated_at"])
        return cls.get(order.pk)

    @classmethod
    def mark_refunded(cls, order: Order) -> Order:
        """Mark a paid order refunded and revoke linked download entitlements.

        Idempotent when both order and payment statuses are already refunded.
        Downloads are denied automatically via ``order_allows_download`` /
        ``user_owns_catalog_item`` (paid + paid required).
        """
        with transaction.atomic():
            locked = Order.objects.select_for_update().prefetch_related("items").get(
                pk=order.pk
            )
            if (
                locked.order_status == Order.OrderStatus.REFUNDED
                and locked.payment_status == Order.PaymentStatus.REFUNDED
            ):
                return cls.get(locked.pk)

            update_fields: list[str] = ["updated_at"]
            if locked.order_status != Order.OrderStatus.REFUNDED:
                cls._apply_status_transition(
                    current=locked.order_status,
                    new_status=Order.OrderStatus.REFUNDED,
                    allowed=ALLOWED_ORDER_STATUS_TRANSITIONS,
                    valid_values=Order.OrderStatus.values,
                    field="order_status",
                )
                locked.order_status = Order.OrderStatus.REFUNDED
                update_fields.append("order_status")
            if locked.payment_status != Order.PaymentStatus.REFUNDED:
                cls._apply_status_transition(
                    current=locked.payment_status,
                    new_status=Order.PaymentStatus.REFUNDED,
                    allowed=ALLOWED_PAYMENT_STATUS_TRANSITIONS,
                    valid_values=Order.PaymentStatus.values,
                    field="payment_status",
                )
                locked.payment_status = Order.PaymentStatus.REFUNDED
                update_fields.append("payment_status")
            locked.save(update_fields=update_fields)

        return cls.get(order.pk)

    @classmethod
    def compute_items_total(cls, order: Order) -> Decimal:
        return sum(
            (item.line_total for item in order.items.all()),
            start=Decimal("0.00"),
        )

    @classmethod
    def _resolve_catalog_item(
        cls,
        product_type: str,
        product_id: UUID,
        *,
        field_prefix: str,
    ) -> tuple[Decimal, str, str, str]:
        if product_type == OrderItem.ProductType.PRODUCT:
            try:
                product = Product.objects.get(pk=product_id)
            except Product.DoesNotExist as exc:
                raise OrderError(
                    "Product not found.",
                    field=f"{field_prefix}.product_id",
                ) from exc
            if product.status != Product.Status.PUBLISHED:
                raise OrderError(
                    "Product is not available for purchase.",
                    field=f"{field_prefix}.product_id",
                )
            purchase_price = (
                product.discount_price
                if product.discount_price is not None
                else product.price
            )
            return purchase_price, product.currency, product.name, product.slug

        try:
            plugin = Plugin.objects.get(pk=product_id)
        except Plugin.DoesNotExist as exc:
            raise OrderError(
                "Plugin not found.",
                field=f"{field_prefix}.product_id",
            ) from exc
        if plugin.status != Plugin.Status.PUBLISHED:
            raise OrderError(
                "Plugin is not available for purchase.",
                field=f"{field_prefix}.product_id",
            )
        purchase_price = (
            plugin.discount_price
            if plugin.discount_price is not None
            else plugin.price
        )
        return purchase_price, plugin.currency, plugin.name, plugin.slug

    @classmethod
    def _apply_status_transition(
        cls,
        *,
        current: str,
        new_status: str,
        allowed: dict[str, frozenset[str]],
        valid_values: list[str],
        field: str,
    ) -> None:
        if new_status not in valid_values:
            raise OrderError("Invalid status.", field=field)
        if new_status == current:
            return
        permitted = allowed.get(current, frozenset())
        if new_status not in permitted:
            raise OrderError(
                f"Cannot transition from {current} to {new_status}.",
                field=field,
            )

    @classmethod
    def _require_user(cls, user_id: UUID) -> User:
        try:
            user = User.objects.select_related("role").get(pk=user_id)
        except User.DoesNotExist as exc:
            raise OrderError("User not found.", field="user_id") from exc
        if not user.is_active:
            raise OrderError("User is inactive.", field="user_id")
        if user.role is None or user.role.role_name != "Customer":
            raise OrderError(
                "Orders can only be created for customer accounts.",
                field="user_id",
            )
        return user

    @staticmethod
    def _generate_invoice_number() -> str:
        date_part = timezone.now().strftime("%Y%m%d")
        suffix = secrets.token_hex(4).upper()
        return f"INV-{date_part}-{suffix}"
