"""Celery tasks for order-related email delivery."""

from __future__ import annotations

import logging

from celery import shared_task

from orders.models import Order

logger = logging.getLogger("orders.tasks")


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
    name="orders.send_payment_receipt",
)
def send_payment_receipt_task(self, order_id: str) -> None:
    """Deliver payment receipt email for a paid order. Retries on SMTP failure."""
    try:
        order = (
            Order.objects.select_related("user")
            .prefetch_related("items")
            .get(pk=order_id)
        )
    except Order.DoesNotExist:
        logger.warning(
            "payment_receipt_task_skipped reason=order_missing order_id=%s",
            order_id,
        )
        return

    from orders.notifications import deliver_payment_receipt

    deliver_payment_receipt(order)
