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


def order_allows_download(order: Order) -> bool:
    return (
        order.order_status == Order.OrderStatus.PAID
        and order.payment_status == Order.PaymentStatus.PAID
        and getattr(getattr(order, "payment", None), "status", None) != "disputed"
    )
