from __future__ import annotations

from uuid import UUID

from django.contrib.auth import get_user_model
from django.db.models import QuerySet

from orders.models import Order, OrderItem

User = get_user_model()


def paid_order_lines() -> QuerySet[OrderItem]:
    """Order lines that entitle their buyer: a paid order whose payment is not disputed."""
    return OrderItem.objects.filter(
        order__order_status=Order.OrderStatus.PAID,
        order__payment_status=Order.PaymentStatus.PAID,
    ).exclude(order__payment__status="disputed")


def user_owns_catalog_item(
    user: User,
    product_type: str,
    product_id: UUID,
) -> bool:
    return paid_order_lines().filter(
        order__user=user,
        product_type=product_type,
        product_id=product_id,
    ).exists()


def owned_catalog_keys(user: User, keys) -> set[tuple[str, UUID]]:
    """Which of these (product_type, product_id) pairs the user already owns, in one query."""
    keys = list(keys)
    if not keys:
        return set()
    rows = paid_order_lines().filter(
        order__user=user,
        product_id__in={product_id for _, product_id in keys},
    ).values_list("product_type", "product_id")
    return set(rows) & set(keys)


def bought_package_kinds(product_id: UUID) -> set[str]:
    """The package kinds of a product that someone bought. A blank kind (a line bought before
    packages existed) means every package; the caller decides what that covers."""
    return set(
        paid_order_lines()
        .filter(product_type=OrderItem.ProductType.PRODUCT, product_id=product_id)
        .values_list("package_kind", flat=True)
        .distinct()
    )


def order_allows_download(order: Order) -> bool:
    return (
        order.order_status == Order.OrderStatus.PAID
        and order.payment_status == Order.PaymentStatus.PAID
        and getattr(getattr(order, "payment", None), "status", None) != "disputed"
    )
