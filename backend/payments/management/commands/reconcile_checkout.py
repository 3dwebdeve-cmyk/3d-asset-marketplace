"""Reconcile one checkout using Stripe's authoritative session state."""

import logging

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from payments.models import CheckoutAttempt, Payment
from payments.payment_common import session_value, stripe, stripe_id
from payments.webhook_service import WebhookService

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Inspect/reconcile a known Stripe test Checkout Session by order ID."

    def add_arguments(self, parser):
        parser.add_argument("order_id")
        parser.add_argument("--session-id")
        parser.add_argument("--execute", action="store_true")

    def handle(self, *args, **options):
        if not settings.STRIPE_SECRET_KEY.startswith("sk_test_"):
            raise CommandError("Checkout reconciliation requires a Stripe test secret key")
        try:
            attempt = CheckoutAttempt.objects.select_related("order").get(order_id=options["order_id"])
        except (CheckoutAttempt.DoesNotExist, ValueError):
            raise CommandError("Unknown checkout attempt") from None
        session_id = options["session_id"] or attempt.stripe_checkout_session_id
        if options["session_id"] and attempt.stripe_checkout_session_id not in (None, session_id):
            raise CommandError("Session ID conflicts with the saved checkout attempt")
        if not session_id:
            payment = Payment.objects.filter(order_id=attempt.order_id).first()
            session_id = payment.stripe_checkout_session_id if payment else None
        if not session_id:
            raise CommandError(
                "No local session ID. Find the Stripe session by metadata order_id in the "
                "test Dashboard, then let its webhook recover this attempt."
            )
        try:
            session = stripe.checkout.Session.retrieve(session_id)
        except stripe.error.StripeError as exc:
            raise CommandError("Unable to retrieve Stripe checkout session") from exc
        if stripe_id(session) != session_id:
            raise CommandError("Retrieved session ID does not match")
        metadata = session_value(session, "metadata") or {}
        if str(session_value(metadata, "order_id") or "") != str(attempt.order_id):
            raise CommandError("Stripe session metadata does not match the order")
        state = str(session_value(session, "status") or "")
        payment_state = str(session_value(session, "payment_status") or "")
        self.stdout.write(
            f"order={attempt.order_id} session={session_id} status={state} "
            f"payment_status={payment_state} execute={options['execute']}"
        )
        if not options["execute"]:
            return
        with transaction.atomic():
            if payment_state == "paid":
                WebhookService._handle_checkout_completed(session)
            elif state == "expired":
                if not Payment.objects.filter(order_id=attempt.order_id).exists():
                    attempt.status = CheckoutAttempt.Status.EXPIRED
                    attempt.stripe_checkout_session_id = session_id
                    attempt.save(update_fields=["status", "stripe_checkout_session_id", "updated_at"])
                WebhookService._handle_checkout_expired(session)
            elif state in {"open", "complete"} and payment_state == "unpaid":
                payment = WebhookService._recover_payment(session)
                checkout_url = str(session_value(session, "url") or "")
                if checkout_url and not payment.checkout_url:
                    payment.checkout_url = checkout_url
                    payment.save(update_fields=["checkout_url", "updated_at"])
                CheckoutAttempt.objects.filter(pk=attempt.pk).update(checkout_url=checkout_url)
            else:
                raise CommandError("Unknown Stripe session state; no local change")
        logger.warning("checkout_reconciled order_id=%s session_id=%s", attempt.order_id, session_id)
