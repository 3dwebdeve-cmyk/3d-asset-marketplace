"""Compare recent paid, refunded and disputed payments with Stripe (read-only)."""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from config.currency import to_minor_units
from config.sentry import capture_payment_mismatch
from orders.models import Order
from payments.models import Payment
from payments.payment_common import E2E_CHECKOUT_SESSION_PREFIX, session_value, stripe, stripe_id

SETTLED_STATUSES = {Payment.Status.SUCCEEDED, Payment.Status.REFUNDED, Payment.Status.DISPUTED}
EXPECTED_ORDER_PAYMENT_STATUS = {
    Payment.Status.SUCCEEDED: Order.PaymentStatus.PAID,
    Payment.Status.DISPUTED: Order.PaymentStatus.PAID,
    Payment.Status.REFUNDED: Order.PaymentStatus.REFUNDED,
}
# Checkouts newer than this may still be waiting for their webhook.
WEBHOOK_GRACE = timedelta(minutes=15)


class Command(BaseCommand):
    help = (
        "Compare recent paid, refunded and disputed payments with Stripe. Read-only: "
        "reports every mismatch, alerts Sentry and fails; fixes are made by a person."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=7,
            help="How many days back to compare (default 7). Use a large value for a full sweep.",
        )

    def handle(self, *args, **options):
        days = options["days"]
        if days < 1:
            raise CommandError("--days must be at least 1")
        if not settings.STRIPE_SECRET_KEY:
            raise CommandError("STRIPE_SECRET_KEY is not configured")
        if getattr(settings, "E2E_STRIPE_SIMULATE", False):
            raise CommandError("Stripe reconciliation cannot run with simulated payments")

        now = timezone.now()
        since = now - timedelta(days=days)
        try:
            checked, problems = self._compare(since, now)
        except stripe.error.StripeError as exc:
            raise CommandError(f"Stripe request failed ({exc.__class__.__name__})") from exc

        for problem in problems:
            self.stdout.write(problem)
        self.stdout.write(f"stripe_reconciliation days={days} payments_checked={checked} mismatches={len(problems)}")
        if problems:
            capture_payment_mismatch(mismatches=len(problems), days=days)
            raise CommandError("Stripe and local payment records disagree; see the lines above.")

    def _compare(self, since, now) -> tuple[int, list[str]]:
        since_ts = int(since.timestamp())
        problems: list[str] = []
        checked: set = set()

        local = (
            Payment.objects.select_related("order")
            .filter(gateway="stripe", status__in=SETTLED_STATUSES, created_at__gte=since)
            .exclude(stripe_checkout_session_id__startswith=E2E_CHECKOUT_SESSION_PREFIX)
            .order_by("created_at")
        )
        for payment in local:
            checked.add(payment.pk)
            problems.extend(self._check_payment(payment))

        # Refunds and disputes in the window can belong to older payments, so a late
        # refund whose webhook was missed is still caught.
        intents: set[str] = set()
        for refund in stripe.Refund.list(created={"gte": since_ts}, limit=100).auto_paging_iter():
            intents.add(stripe_id(session_value(refund, "payment_intent")))
        for dispute in stripe.Dispute.list(created={"gte": since_ts}, limit=100).auto_paging_iter():
            intents.add(stripe_id(session_value(dispute, "payment_intent")))
        intents.discard("")
        for intent_id in sorted(intents):
            payment = Payment.objects.select_related("order").filter(stripe_payment_intent_id=intent_id).first()
            if payment is None:
                problems.append(f"stripe_refund_or_dispute_without_local_payment payment_intent={intent_id}")
            elif payment.pk not in checked:
                checked.add(payment.pk)
                problems.extend(self._check_payment(payment))

        # Money Stripe took that was never recorded locally.
        until_ts = int((now - WEBHOOK_GRACE).timestamp())
        sessions = stripe.checkout.Session.list(
            created={"gte": since_ts, "lte": until_ts}, status="complete", limit=100
        )
        for session in sessions.auto_paging_iter():
            if str(session_value(session, "payment_status") or "") != "paid":
                continue
            metadata = session_value(session, "metadata") or {}
            if not session_value(metadata, "order_id"):
                continue  # not created by this marketplace
            session_id = stripe_id(session)
            payment = Payment.objects.filter(stripe_checkout_session_id=session_id).first()
            if payment is None:
                problems.append(f"paid_checkout_without_local_payment session={session_id}")
            elif payment.status not in SETTLED_STATUSES:
                problems.append(
                    f"paid_checkout_not_settled_locally payment={payment.pk} order={payment.order_id} "
                    f"local={payment.status}"
                )
        return len(checked), problems

    def _check_payment(self, payment: Payment) -> list[str]:
        label = f"payment={payment.pk} order={payment.order_id}"
        problems: list[str] = []

        expected_order = EXPECTED_ORDER_PAYMENT_STATUS[payment.status]
        if payment.order.payment_status != expected_order:
            problems.append(
                f"order_status_mismatch {label} payment={payment.status} "
                f"order_payment_status={payment.order.payment_status}"
            )

        intent_id = payment.stripe_payment_intent_id
        if not intent_id:
            problems.append(f"settled_payment_without_payment_intent {label}")
            return problems

        try:
            intent = stripe.PaymentIntent.retrieve(intent_id, expand=["latest_charge"])
        except stripe.error.InvalidRequestError as exc:
            if getattr(exc, "code", None) != "resource_missing":
                raise
            # A payment Stripe has never seen is a mismatch, not a reason to stop the run.
            problems.append(f"payment_intent_missing_in_stripe {label} payment_intent={intent_id}")
            return problems
        intent_status = str(session_value(intent, "status") or "")
        if intent_status != "succeeded":
            problems.append(f"status_mismatch {label} local={payment.status} stripe_intent={intent_status}")
            return problems

        currency = str(session_value(intent, "currency") or "").upper()
        if currency != payment.currency.upper():
            problems.append(f"currency_mismatch {label} local={payment.currency} stripe={currency}")
            return problems
        stripe_amount = session_value(intent, "amount_received")
        if stripe_amount != to_minor_units(payment.amount, payment.currency):
            problems.append(f"amount_mismatch {label} local={payment.amount} stripe_minor={stripe_amount}")

        charge = session_value(intent, "latest_charge")
        if not charge or isinstance(charge, str):
            problems.append(f"charge_missing {label}")
            return problems

        # Same rules as the webhook: a full refund wins; a dispute counts until won.
        if session_value(charge, "refunded"):
            expected = Payment.Status.REFUNDED
        elif session_value(charge, "disputed"):
            disputes = stripe.Dispute.list(payment_intent=intent_id, limit=1)
            latest = disputes.data[0] if disputes.data else None
            won = latest is not None and str(session_value(latest, "status") or "") == "won"
            expected = Payment.Status.SUCCEEDED if won else Payment.Status.DISPUTED
        else:
            expected = Payment.Status.SUCCEEDED
        if payment.status != expected:
            problems.append(f"status_mismatch {label} local={payment.status} stripe={expected}")

        stripe_refunded = int(session_value(charge, "amount_refunded") or 0)
        if stripe_refunded != to_minor_units(payment.refunded_amount, payment.currency):
            problems.append(
                f"refund_amount_mismatch {label} local={payment.refunded_amount} stripe_minor={stripe_refunded}"
            )
        return problems
