from __future__ import annotations

from uuid import UUID

from django.contrib.auth import get_user_model

from orders.models import Order, OrderItem

User = get_user_model()


def user_owns_catalog_item(
    user: User,
    product_type: str,
    product_id: UUID,
) -> bool:
    return OrderItem.objects.filter(
        order__user=user,
        order__order_status=Order.OrderStatus.PAID,
        order__payment_status=Order.PaymentStatus.PAID,
        product_type=product_type,
        product_id=product_id,
    ).exclude(order__payment__status="disputed").exists()


def owned_catalog_keys(user: User, keys) -> set[tuple[str, UUID]]:
    """Which of these (product_type, product_id) pairs the user already owns, in one query."""
    keys = list(keys)
    if not keys:
        return set()
    rows = OrderItem.objects.filter(
        order__user=user,
        order__order_status=Order.OrderStatus.PAID,
        order__payment_status=Order.PaymentStatus.PAID,
        product_id__in={product_id for _, product_id in keys},
    ).exclude(order__payment__status="disputed").values_list("product_type", "product_id")
    return set(rows) & set(keys)


def order_allows_download(order: Order) -> bool:
    return (
        order.order_status == Order.OrderStatus.PAID
        and order.payment_status == Order.PaymentStatus.PAID
        and getattr(getattr(order, "payment", None), "status", None) != "disputed"
    )
