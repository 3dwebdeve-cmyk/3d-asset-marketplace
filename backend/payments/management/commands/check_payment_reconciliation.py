"""Alert on checkout attempts that require human reconciliation."""

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from orders.models import Order
from payments.models import CheckoutAttempt, Payment


class Command(BaseCommand):
    help = (
        "Fail when checkout attempts, pending payments, or local order/payment "
        "records disagree. Makes no Stripe calls."
    )

    def handle(self, *args, **options):
        now = timezone.now()
        unresolved = CheckoutAttempt.objects.filter(
            status__in=[CheckoutAttempt.Status.PREPARED, CheckoutAttempt.Status.REVIEW],
            created_at__lt=now - timedelta(minutes=10),
        ).count()
        old_pending = Payment.objects.filter(
            status=Payment.Status.PENDING,
            created_at__lt=now - timedelta(hours=25),
        ).count()
        # Paid orders must have a settled payment. Disputed payments still count
        # as settled because the money was captured.
        settled_statuses = [Payment.Status.SUCCEEDED, Payment.Status.DISPUTED]
        paid_without_payment = (
            Order.objects.filter(payment_status=Order.PaymentStatus.PAID)
            .exclude(id__in=Payment.objects.filter(status__in=settled_statuses).values("order_id"))
            .count()
        )
        payment_without_paid_order = (
            Payment.objects.filter(status=Payment.Status.SUCCEEDED)
            .exclude(order__payment_status=Order.PaymentStatus.PAID)
            .count()
        )
        self.stdout.write(
            f"unresolved_checkout_attempts={unresolved} old_pending_payments={old_pending} "
            f"paid_orders_without_payment={paid_without_payment} "
            f"succeeded_payments_on_unpaid_orders={payment_without_paid_order}"
        )
        if unresolved or old_pending or paid_without_payment or payment_without_paid_order:
            raise CommandError("Payment reconciliation needs investigation.")
