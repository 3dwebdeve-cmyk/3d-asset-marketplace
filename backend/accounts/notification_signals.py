"""Write notifications in the same transaction as the triggering change."""
import uuid

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from accounts.models import AdminNotification
from orders.models import Order
from payments.models import CheckoutAttempt, Payment
from products.models import Product


@receiver(post_save, sender=Product)
def model_review_notification(sender, instance, raw=False, **kwargs):
    if raw:
        return
    if instance.status == Product.Status.PENDING_REVIEW:
        AdminNotification.objects.get_or_create(
            product=instance, kind="model_review", resolved_at=None,
            defaults={"event_key": f"review:{uuid.uuid4()}",
                      "title": f"Model waiting for approval: {instance.name}"[:255],
                      "path": f"/console/products/{instance.pk}"},
        )
    else:
        AdminNotification.objects.filter(product=instance, kind="model_review", resolved_at=None).update(resolved_at=timezone.now())


@receiver(post_save, sender=Order)
def order_notification(sender, instance, raw=False, **kwargs):
    if not raw and instance.order_status == Order.OrderStatus.PAID and instance.payment_status == Order.PaymentStatus.PAID:
        AdminNotification.objects.get_or_create(
            event_key=f"paid:{instance.pk}", defaults={"kind": "paid_order",
                "title": f"New paid order: {instance.invoice_number}"[:255],
                "path": f"/console/orders/{instance.pk}"},
        )


@receiver(post_save, sender=Payment)
def payment_notification(sender, instance, raw=False, **kwargs):
    if not raw and instance.status == Payment.Status.DISPUTED:
        AdminNotification.objects.get_or_create(
            event_key=f"dispute:{instance.pk}", defaults={"kind": "payment_issue",
                "title": "Payment dispute needs attention", "path": f"/console/orders/{instance.order_id}"},
        )


@receiver(post_save, sender=CheckoutAttempt)
def checkout_notification(sender, instance, raw=False, **kwargs):
    if not raw and instance.status == CheckoutAttempt.Status.REVIEW:
        AdminNotification.objects.get_or_create(
            event_key=f"checkout-review:{instance.pk}", defaults={"kind": "payment_issue",
                "title": "Checkout needs payment reconciliation", "path": f"/console/orders/{instance.order_id}"},
        )
