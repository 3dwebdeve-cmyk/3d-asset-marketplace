"""Daily Stripe reconciliation: read-only comparison with alerting (Stripe mocked)."""

from datetime import timedelta
from decimal import Decimal
from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch

import stripe
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import Role, User
from orders.models import Order
from payments.models import Payment

COMMAND = "reconcile_stripe_payments"
SENTRY = "payments.management.commands.reconcile_stripe_payments.capture_payment_mismatch"


def _list(items=()):
    items = list(items)
    return SimpleNamespace(data=items, auto_paging_iter=lambda: iter(items))


def _intent(*, status="succeeded", amount=4999, currency="usd", refunded=False,
            amount_refunded=0, disputed=False):
    return {
        "id": "pi_rec_1",
        "status": status,
        "amount_received": amount,
        "currency": currency,
        "latest_charge": {
            "id": "ch_rec_1",
            "refunded": refunded,
            "amount_refunded": amount_refunded,
            "disputed": disputed,
        },
    }


@override_settings(STRIPE_SECRET_KEY="sk_test_reconcile_dummy", E2E_STRIPE_SIMULATE=False)
class StripeReconciliationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="reconcile@example.com",
            full_name="Reconcile Customer",
            password="StrongPass123!",
            role=Role.objects.get(role_name="Customer"),
        )
        self.order = Order.objects.create(
            user=self.user,
            invoice_number="INV-REC-0001",
            total_amount=Decimal("49.99"),
            currency="USD",
            order_status=Order.OrderStatus.PAID,
            payment_status=Order.PaymentStatus.PAID,
        )
        self.payment = Payment.objects.create(
            order=self.order,
            stripe_checkout_session_id="cs_test_rec_1",
            stripe_payment_intent_id="pi_rec_1",
            amount=Decimal("49.99"),
            currency="USD",
            status=Payment.Status.SUCCEEDED,
        )
        self.refunds = _list()
        self.disputes = _list()
        self.sessions = _list()
        self.intent = _intent()
        self.intent_calls = []
        self.dispute_status = "needs_response"
        patches = [
            patch.object(stripe.Refund, "list", side_effect=lambda **kw: self.refunds),
            patch.object(stripe.Dispute, "list", side_effect=self._dispute_list),
            patch.object(stripe.checkout.Session, "list", side_effect=lambda **kw: self.sessions),
            patch.object(stripe.PaymentIntent, "retrieve", side_effect=self._retrieve_intent),
            patch.object(stripe.Refund, "create", side_effect=AssertionError("must not write")),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def _retrieve_intent(self, intent_id, **kwargs):
        self.intent_calls.append(intent_id)
        return self.intent

    def _dispute_list(self, **kwargs):
        if "payment_intent" in kwargs:
            return _list([{"id": "dp_1", "status": self.dispute_status}])
        return self.disputes

    def _run(self, *args):
        out = StringIO()
        with patch(SENTRY) as alert:
            try:
                call_command(COMMAND, *args, stdout=out)
                error = None
            except CommandError as exc:
                error = exc
        return out.getvalue(), error, alert

    def test_matching_records_pass_without_alert(self):
        out, error, alert = self._run()
        self.assertIsNone(error)
        self.assertIn("payments_checked=1 mismatches=0", out)
        alert.assert_not_called()

    def test_refund_missed_locally_is_reported_and_alerted(self):
        self.intent = _intent(refunded=True, amount_refunded=4999)
        out, error, alert = self._run()
        self.assertIsNotNone(error)
        self.assertIn("status_mismatch", out)
        self.assertIn("local=succeeded stripe=refunded", out)
        self.assertIn("refund_amount_mismatch", out)
        alert.assert_called_once_with(mismatches=2, days=7)

    def test_read_only_never_changes_local_records(self):
        self.intent = _intent(refunded=True, amount_refunded=4999)
        self._run()
        self.payment.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)

    def test_local_refund_matching_stripe_passes(self):
        Payment.objects.filter(pk=self.payment.pk).update(
            status=Payment.Status.REFUNDED, refunded_amount=Decimal("49.99")
        )
        Order.objects.filter(pk=self.order.pk).update(
            order_status=Order.OrderStatus.REFUNDED, payment_status=Order.PaymentStatus.REFUNDED
        )
        self.intent = _intent(refunded=True, amount_refunded=4999)
        _, error, alert = self._run()
        self.assertIsNone(error)
        alert.assert_not_called()

    def test_partial_refund_amount_must_match(self):
        self.intent = _intent(amount_refunded=1000)
        out, error, _ = self._run()
        self.assertIsNotNone(error)
        self.assertIn("refund_amount_mismatch", out)
        self.assertNotIn("status_mismatch", out)

    def test_open_dispute_expects_disputed(self):
        self.intent = _intent(disputed=True)
        out, error, _ = self._run()
        self.assertIsNotNone(error)
        self.assertIn("local=succeeded stripe=disputed", out)

    def test_won_dispute_expects_succeeded(self):
        self.intent = _intent(disputed=True)
        self.dispute_status = "won"
        _, error, _ = self._run()
        self.assertIsNone(error)

    def test_amount_and_intent_status_mismatches(self):
        self.intent = _intent(amount=100)
        out, _, _ = self._run()
        self.assertIn("amount_mismatch", out)
        self.intent = _intent(status="requires_payment_method")
        out, _, _ = self._run()
        self.assertIn("stripe_intent=requires_payment_method", out)

    def test_order_payment_status_must_follow_payment(self):
        Order.objects.filter(pk=self.order.pk).update(payment_status=Order.PaymentStatus.PENDING)
        out, error, _ = self._run()
        self.assertIsNotNone(error)
        self.assertIn("order_status_mismatch", out)

    def test_late_refund_on_older_payment_is_checked(self):
        Payment.objects.filter(pk=self.payment.pk).update(created_at=timezone.now() - timedelta(days=60))
        self.refunds = _list([{"id": "re_1", "payment_intent": "pi_rec_1"}])
        self.intent = _intent(refunded=True, amount_refunded=4999)
        out, error, _ = self._run()
        self.assertIsNotNone(error)
        self.assertIn("local=succeeded stripe=refunded", out)
        self.assertEqual(self.intent_calls, ["pi_rec_1"])

    def test_old_payment_outside_window_is_skipped(self):
        Payment.objects.filter(pk=self.payment.pk).update(created_at=timezone.now() - timedelta(days=60))
        out, error, _ = self._run()
        self.assertIsNone(error)
        self.assertIn("payments_checked=0", out)
        self.assertEqual(self.intent_calls, [])
        _, _, _ = self._run("--days", "90")
        self.assertEqual(self.intent_calls, ["pi_rec_1"])

    def test_refund_for_unknown_payment_is_reported(self):
        self.refunds = _list([{"id": "re_2", "payment_intent": "pi_unknown"}])
        out, error, _ = self._run()
        self.assertIsNotNone(error)
        self.assertIn("stripe_refund_or_dispute_without_local_payment payment_intent=pi_unknown", out)

    def test_paid_checkout_missing_locally_is_reported(self):
        self.sessions = _list([
            {"id": "cs_lost", "payment_status": "paid", "metadata": {"order_id": "x"}},
            {"id": "cs_other_app", "payment_status": "paid", "metadata": {}},
            {"id": "cs_unpaid", "payment_status": "unpaid", "metadata": {"order_id": "y"}},
        ])
        out, error, _ = self._run()
        self.assertIsNotNone(error)
        self.assertIn("paid_checkout_without_local_payment session=cs_lost", out)
        self.assertNotIn("cs_other_app", out)
        self.assertNotIn("cs_unpaid", out)

    def test_paid_checkout_still_pending_locally_is_reported(self):
        Payment.objects.filter(pk=self.payment.pk).update(status=Payment.Status.PENDING)
        self.sessions = _list([{"id": "cs_test_rec_1", "payment_status": "paid", "metadata": {"order_id": "x"}}])
        out, error, _ = self._run()
        self.assertIsNotNone(error)
        self.assertIn("paid_checkout_not_settled_locally", out)

    def test_recent_checkouts_get_webhook_grace(self):
        calls = []
        stripe.checkout.Session.list.side_effect = lambda **kw: calls.append(kw) or self.sessions
        before = int((timezone.now() - timedelta(minutes=15)).timestamp())
        self._run()
        self.assertLessEqual(calls[0]["created"]["lte"], before + 1)

    def test_payment_unknown_to_stripe_is_reported_and_run_continues(self):
        stripe.PaymentIntent.retrieve.side_effect = stripe.error.InvalidRequestError(
            "No such payment_intent", "intent", code="resource_missing"
        )
        self.refunds = _list([{"id": "re_3", "payment_intent": "pi_unknown"}])
        out, error, alert = self._run()
        self.assertIsNotNone(error)
        self.assertIn("payment_intent_missing_in_stripe", out)
        self.assertIn("pi_unknown", out)
        alert.assert_called_once_with(mismatches=2, days=7)

    def test_stripe_error_fails_cleanly(self):
        stripe.PaymentIntent.retrieve.side_effect = stripe.error.APIConnectionError("down")
        _, error, alert = self._run()
        self.assertIn("Stripe request failed (APIConnectionError)", str(error))
        alert.assert_not_called()

    @override_settings(STRIPE_SECRET_KEY="")
    def test_requires_stripe_key(self):
        _, error, _ = self._run()
        self.assertIn("STRIPE_SECRET_KEY", str(error))

    def test_rejects_invalid_days(self):
        _, error, _ = self._run("--days", "0")
        self.assertIn("--days", str(error))
