"""Alert on checkout attempts that require human reconciliation."""

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from payments.models import CheckoutAttempt, Payment


class Command(BaseCommand):
    help = "Fail when checkout attempts or pending payments exceed review thresholds."

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
        self.stdout.write(f"unresolved_checkout_attempts={unresolved} old_pending_payments={old_pending}")
        if unresolved or old_pending:
            raise CommandError("Payment reconciliation needs investigation.")
