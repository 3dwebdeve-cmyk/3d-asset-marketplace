"""Payment receipt email notifications.

Policy: email delivery failures never block Stripe webhook fulfillment.
Emails are enqueued on Celery after DB commit. Failures are logged; emails
never include secrets, tokens, or storage paths.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import EmailMessage

from config.celery_utils import enqueue_after_commit
from config.mail import frontend_base_url, render_text_email, safe_email_text
from mail_log.services import MailLogService
from orders.invoice import build_invoice_pdf, invoice_pdf_filename
from orders.models import Order
from orders.services import OrderService

logger = logging.getLogger("orders.notifications")


def deliver_payment_receipt(order: Order) -> None:
    """Send a payment receipt email with invoice PDF attached.

    Raises on SMTP/delivery failure so Celery can retry. Callers that must not
    raise should use :func:`enqueue_payment_receipt` instead.
    """
    customer = order.user
    recipient = (getattr(customer, "email", None) or "").strip()
    if not recipient:
        logger.warning(
            "payment_receipt_email_skipped reason=no_recipient order_id=%s",
            order.pk,
        )
        MailLogService.record_skipped(
            event_type="payment_receipt",
            reason="no_recipient",
            related_object_type="order",
            related_object_id=str(order.pk),
        )
        return

    customer_name = (
        (getattr(customer, "full_name", None) or "").strip() or recipient
    )
    items_total = OrderService.compute_items_total(order)
    item_lines: list[str] = []
    for item in order.items.all():
        title = (item.title or "").strip() or f"{item.product_type} item"
        item_lines.append(
            f"- {title} x{item.quantity} @ {order.currency} "
            f"{item.purchase_price} = {order.currency} {item.line_total}"
        )
    items_summary = "\n".join(item_lines) if item_lines else "- (no items)"

    base = frontend_base_url()
    order_link = f"{base}/dashboard/orders/{order.pk}"
    downloads_link = f"{base}/dashboard/downloads"
    body = render_text_email(
        "orders/emails/payment_receipt.txt",
        {
            "customer_name": safe_email_text(customer_name),
            "invoice_number": safe_email_text(order.invoice_number),
            "items_summary": items_summary,
            "items_total": f"{order.currency} {items_total:.2f}",
            "total_amount": f"{order.currency} {order.total_amount}",
            "order_link": order_link,
            "downloads_link": downloads_link,
        },
    )

    subject = safe_email_text(
        f"Payment received — Order {order.invoice_number}"
    )
    log_id = MailLogService.record_queued(
        event_type="payment_receipt",
        recipients=[recipient],
        related_object_type="order",
        related_object_id=str(order.pk),
        subject=subject,
    )
    message = EmailMessage(
        subject=subject,
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
    )
    try:
        # Build inside the try: a PDF failure must mark this attempt failed,
        # not leave its log row queued.
        pdf_bytes = build_invoice_pdf(order)
        message.attach(
            invoice_pdf_filename(order),
            pdf_bytes,
            "application/pdf",
        )
        message.send(fail_silently=False)
    except Exception as exc:
        MailLogService.mark_failed(log_id, str(exc))
        raise
    MailLogService.mark_sent(log_id)
    logger.info(
        "payment_receipt_email_sent order_id=%s invoice=%s",
        order.pk,
        order.invoice_number,
    )


def enqueue_payment_receipt(order: Order) -> None:
    """Queue receipt email after the current DB transaction commits."""
    from orders.tasks import send_payment_receipt_task

    enqueue_after_commit(send_payment_receipt_task, str(order.pk))
