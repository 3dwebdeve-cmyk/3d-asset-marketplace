"""Checkout recovery and terminal event regressions (all Stripe calls mocked)."""

from unittest.mock import patch
from io import StringIO
from types import SimpleNamespace
import importlib

import stripe
from django.core.management import call_command
from django.apps import apps
from django.db import connection
from django.test import override_settings
from rest_framework.test import APITestCase

from payments.checkout_service import CheckoutService
from payments.models import CheckoutAttempt, Payment
from payments.payment_common import CheckoutError
from payments.test_payments import PaymentsTestMixin, _fake_session
from payments.webhook_service import WebhookService
from orders.models import Order
from orders.services import OrderService
from cart.models import CartItem
from cart.services import CartService


@override_settings(STRIPE_SECRET_KEY="sk_test_phase2_dummy")
class CheckoutRecoveryTests(PaymentsTestMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self._add_to_cart("product", self.product.pk)

    @patch("payments.checkout_service.stripe.checkout.Session.create")
    def test_remote_timeout_reuses_persisted_key_and_order(self, create):
        create.side_effect = [stripe.error.APIConnectionError("timeout"), _fake_session("cs_retry")]
        with self.assertRaises(CheckoutError):
            CheckoutService.create_checkout_session(self.user)
        attempt = CheckoutAttempt.objects.get()
        self.assertEqual(attempt.status, CheckoutAttempt.Status.REVIEW)
        self.assertFalse(Payment.objects.exists())
        self.user.email = "changed-after-timeout@example.com"
        self.user.save(update_fields=["email"])
        result = CheckoutService.create_checkout_session(self.user)
        self.assertEqual(result["order_id"], str(attempt.order_id))
        self.assertEqual(create.call_count, 2)
        self.assertEqual(
            create.call_args_list[0].kwargs["idempotency_key"],
            create.call_args_list[1].kwargs["idempotency_key"],
        )
        self.assertEqual(create.call_args_list[0].kwargs, create.call_args_list[1].kwargs)

    @patch("payments.checkout_service.stripe.checkout.Session.create")
    def test_crash_before_local_payment_persistence_reuses_key(self, create):
        create.return_value = _fake_session("cs_crash")
        with patch("payments.checkout_service.Payment.objects.get_or_create", side_effect=RuntimeError("db lost")):
            with self.assertRaises(RuntimeError):
                CheckoutService.create_checkout_session(self.user)
        attempt = CheckoutAttempt.objects.get()
        self.assertEqual(attempt.status, CheckoutAttempt.Status.PREPARED)
        CheckoutService.create_checkout_session(self.user)
        self.assertEqual(create.call_count, 2)
        self.assertEqual(
            create.call_args_list[0].kwargs["idempotency_key"],
            create.call_args_list[1].kwargs["idempotency_key"],
        )
        self.assertEqual(Payment.objects.count(), 1)

    @patch("payments.checkout_service.stripe.checkout.Session.create")
    def test_webhook_recovers_missing_local_payment(self, create):
        create.return_value = _fake_session("cs_recovered")
        with patch("payments.checkout_service.Payment.objects.get_or_create", side_effect=RuntimeError("db lost")):
            with self.assertRaises(RuntimeError):
                CheckoutService.create_checkout_session(self.user)
        attempt = CheckoutAttempt.objects.get()
        order = attempt.order
        session = {
            "id": "cs_recovered", "payment_intent": "pi_recovered",
            "payment_status": "paid", "amount_total": 4999, "currency": "usd",
            "client_reference_id": str(self.user.pk),
            "metadata": {"order_id": str(order.pk)},
        }
        with self.settings(BACKGROUND_JOBS_TEST_EAGER=False):
            WebhookService._handle_checkout_completed(session)
        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.status, Payment.Status.SUCCEEDED)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "paid")
        self.assertEqual(CheckoutAttempt.objects.get(pk=attempt.pk).status, CheckoutAttempt.Status.READY)

    def test_async_failure_is_terminal_but_intent_failure_is_not(self):
        order = Order.objects.create(user=self.user, invoice_number="PHASE2-ASYNC", total_amount="49.99")
        payment = Payment.objects.create(
            order=order, stripe_checkout_session_id="cs_async", amount="49.99", currency="USD",
        )
        WebhookService._handle_payment_failed({"id": "pi_transient"})
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PENDING)
        WebhookService._handle_checkout_failed({"id": "cs_async"})
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.FAILED)

    def test_paid_event_after_local_expiry_requires_review(self):
        order = OrderService.create_from_cart(self.user)
        Payment.objects.create(
            order=order, stripe_checkout_session_id="cs_expired_race",
            amount=order.total_amount, currency=order.currency,
        )
        WebhookService._handle_checkout_expired({"id": "cs_expired_race"})
        session = {
            "id": "cs_expired_race", "payment_intent": "pi_expired_race",
            "payment_status": "paid", "amount_total": 4999, "currency": "usd",
            "client_reference_id": str(self.user.pk),
            "metadata": {"order_id": str(order.pk)},
        }
        with self.assertRaisesRegex(RuntimeError, "operator reconciliation"):
            WebhookService._handle_checkout_completed(session)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, Order.PaymentStatus.PENDING)

    def test_invoice_collision_retries_inside_savepoint(self):
        Order.objects.create(user=self.user, invoice_number="COLLISION", total_amount="1.00")
        with patch.object(OrderService, "_generate_invoice_number", side_effect=["COLLISION", "UNIQUE"]):
            order = OrderService.create_from_cart(self.user)
        self.assertEqual(order.invoice_number, "UNIQUE")

    def test_checkout_cleanup_preserves_cart_line_changed_after_snapshot(self):
        order = OrderService.create_from_cart(self.user)
        item = CartItem.objects.get(cart__user=self.user)
        CartService.update_quantity(self.user, item.pk, 2)
        CartService.remove_items(
            self.user, {(item.product_type, item.product_id)}, before=order.created_at,
        )
        item.refresh_from_db()
        self.assertEqual(item.quantity, 2)

    @patch("payments.checkout_service.stripe.checkout.Session.create")
    @patch("payments.checkout_service.stripe.checkout.Session.retrieve")
    def test_missing_sandbox_session_is_expired_before_new_checkout(self, retrieve, create):
        old_order = OrderService.create_from_cart(self.user)
        old_attempt = CheckoutAttempt.objects.create(
            order=old_order,
            status=CheckoutAttempt.Status.READY,
            stripe_checkout_session_id="cs_missing_sandbox",
            checkout_url="https://checkout.stripe.com/pay/cs_missing_sandbox",
        )
        old_payment = Payment.objects.create(
            order=old_order,
            stripe_checkout_session_id="cs_missing_sandbox",
            checkout_url="https://checkout.stripe.com/pay/cs_missing_sandbox",
            amount=old_order.total_amount,
            currency=old_order.currency,
        )
        self._add_to_cart("plugin", self.plugin.pk)
        retrieve.side_effect = stripe.error.InvalidRequestError(
            "No such checkout session",
            "id",
            code="resource_missing",
        )
        create.return_value = _fake_session("cs_after_missing_sandbox")

        result = CheckoutService.create_checkout_session(self.user)

        self.assertEqual(result["checkout_url"], _fake_session("cs_after_missing_sandbox").url)
        old_payment.refresh_from_db()
        old_attempt.refresh_from_db()
        self.assertEqual(old_payment.status, Payment.Status.EXPIRED)
        self.assertEqual(old_attempt.status, CheckoutAttempt.Status.EXPIRED)

    @override_settings(
        STRIPE_PAYMENT_MODE="live",
        STRIPE_SECRET_KEY="sk_live_phase2_dummy",
    )
    @patch("payments.checkout_service.stripe.checkout.Session.retrieve")
    def test_missing_live_session_remains_fail_closed(self, retrieve):
        old_order = OrderService.create_from_cart(self.user)
        CheckoutAttempt.objects.create(
            order=old_order,
            status=CheckoutAttempt.Status.READY,
            stripe_checkout_session_id="cs_missing_live",
        )
        old_payment = Payment.objects.create(
            order=old_order,
            stripe_checkout_session_id="cs_missing_live",
            amount=old_order.total_amount,
            currency=old_order.currency,
        )
        self._add_to_cart("plugin", self.plugin.pk)
        retrieve.side_effect = stripe.error.InvalidRequestError(
            "No such checkout session",
            "id",
            code="resource_missing",
        )

        with self.assertRaisesRegex(CheckoutError, "needs verification"):
            CheckoutService.create_checkout_session(self.user)

        old_payment.refresh_from_db()
        self.assertEqual(old_payment.status, Payment.Status.PENDING)

    @patch("payments.checkout_service.stripe.checkout.Session.create")
    @patch("payments.checkout_service.stripe.checkout.Session.retrieve")
    def test_completed_unpaid_sandbox_session_is_expired(self, retrieve, create):
        old_order = OrderService.create_from_cart(self.user)
        old_attempt = CheckoutAttempt.objects.create(
            order=old_order,
            status=CheckoutAttempt.Status.READY,
            stripe_checkout_session_id="cs_unpaid_sandbox",
        )
        old_payment = Payment.objects.create(
            order=old_order,
            stripe_checkout_session_id="cs_unpaid_sandbox",
            amount=old_order.total_amount,
            currency=old_order.currency,
        )
        self._add_to_cart("plugin", self.plugin.pk)
        retrieve.return_value = {
            "id": "cs_unpaid_sandbox",
            "status": "complete",
            "payment_status": "unpaid",
        }
        create.return_value = _fake_session("cs_after_unpaid_sandbox")

        CheckoutService.create_checkout_session(self.user)

        old_payment.refresh_from_db()
        old_attempt.refresh_from_db()
        self.assertEqual(old_payment.status, Payment.Status.EXPIRED)
        self.assertEqual(old_attempt.status, CheckoutAttempt.Status.EXPIRED)

    @patch("payments.checkout_service.stripe.checkout.Session.create")
    @patch("payments.checkout_service.stripe.checkout.Session.retrieve")
    def test_paid_pending_checkout_is_fulfilled_before_new_checkout(self, retrieve, create):
        old_order = OrderService.create_from_cart(self.user)
        old_payment = Payment.objects.create(
            order=old_order,
            stripe_checkout_session_id="cs_paid_old",
            amount=old_order.total_amount,
            currency=old_order.currency,
        )
        self._add_to_cart("plugin", self.plugin.pk)
        retrieve.return_value = {
            "id": "cs_paid_old",
            "status": "complete",
            "payment_status": "paid",
            "payment_intent": "pi_paid_old",
            "amount_total": 4999,
            "currency": "usd",
            "client_reference_id": str(self.user.pk),
            "metadata": {"order_id": str(old_order.pk)},
        }
        create.return_value = _fake_session("cs_after_paid_old")

        result = CheckoutService.create_checkout_session(self.user)

        self.assertEqual(result["checkout_url"], _fake_session("cs_after_paid_old").url)
        old_payment.refresh_from_db()
        old_order.refresh_from_db()
        self.assertEqual(old_payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(old_order.payment_status, Order.PaymentStatus.PAID)
        new_order = Order.objects.get(pk=result["order_id"])
        self.assertEqual(
            list(new_order.items.values_list("product_type", flat=True)),
            ["plugin"],
        )

    @patch("payments.checkout_service.stripe.checkout.Session.create")
    @patch("payments.checkout_service.stripe.checkout.Session.retrieve")
    def test_stale_matching_attempt_starts_a_new_checkout(self, retrieve, create):
        from datetime import timedelta
        from django.utils import timezone

        old_order = OrderService.create_from_cart(self.user)
        old_payment = Payment.objects.create(
            order=old_order,
            stripe_checkout_session_id="cs_stale_expired",
            amount=old_order.total_amount,
            currency=old_order.currency,
        )
        old_attempt = CheckoutAttempt.objects.create(
            order=old_order,
            status=CheckoutAttempt.Status.REVIEW,
            stripe_checkout_session_id="cs_stale_expired",
        )
        stale_at = timezone.now() - timedelta(hours=24)
        CheckoutAttempt.objects.filter(pk=old_attempt.pk).update(created_at=stale_at)
        Order.objects.filter(pk=old_order.pk).update(created_at=stale_at)
        sessionless_order = Order.objects.create(
            user=self.user,
            invoice_number="STALE-PREPARED",
            total_amount="1.00",
        )
        sessionless = CheckoutAttempt.objects.create(
            order=sessionless_order,
            status=CheckoutAttempt.Status.PREPARED,
        )
        retrieve.return_value = {
            "id": "cs_stale_expired",
            "status": "expired",
            "payment_status": "unpaid",
        }
        create.return_value = _fake_session("cs_after_stale")

        result = CheckoutService.create_checkout_session(self.user)

        self.assertNotEqual(result["order_id"], str(old_order.pk))
        self.assertEqual(result["checkout_url"], _fake_session("cs_after_stale").url)
        old_payment.refresh_from_db()
        old_attempt.refresh_from_db()
        sessionless.refresh_from_db()
        self.assertEqual(old_payment.status, Payment.Status.EXPIRED)
        self.assertEqual(old_attempt.status, CheckoutAttempt.Status.EXPIRED)
        self.assertEqual(sessionless.status, CheckoutAttempt.Status.EXPIRED)

    def test_legacy_pending_payment_is_backfilled_for_reconciliation(self):
        order = OrderService.create_from_cart(self.user)
        payment = Payment.objects.create(
            order=order, stripe_checkout_session_id="cs_legacy",
            checkout_url="https://checkout.stripe.com/pay/cs_legacy",
            amount=order.total_amount, currency=order.currency,
        )
        migration = importlib.import_module(
            "payments.migrations.0007_backfill_pending_checkout_attempts"
        )
        migration.backfill(apps, SimpleNamespace(connection=connection))
        attempt = CheckoutAttempt.objects.get(order=order)
        self.assertEqual(attempt.stripe_checkout_session_id, "cs_legacy")
        self.assertEqual(attempt.created_at, payment.created_at)

    @patch("payments.management.commands.reconcile_checkout.stripe.checkout.Session.retrieve")
    def test_operator_reconciles_open_session_without_local_payment(self, retrieve):
        order = OrderService.create_from_cart(self.user)
        attempt = CheckoutAttempt.objects.create(order=order, status=CheckoutAttempt.Status.REVIEW)
        retrieve.return_value = {
            "id": "cs_operator", "status": "open", "payment_status": "unpaid",
            "url": "https://checkout.stripe.com/pay/cs_operator",
            "amount_total": 4999, "currency": "usd",
            "client_reference_id": str(self.user.pk),
            "metadata": {"order_id": str(order.pk)},
        }
        call_command("reconcile_checkout", str(order.pk), session_id="cs_operator", stdout=StringIO())
        self.assertFalse(Payment.objects.filter(order=order).exists())
        call_command(
            "reconcile_checkout", str(order.pk), session_id="cs_operator",
            execute=True, stdout=StringIO(),
        )
        self.assertEqual(Payment.objects.get(order=order).status, Payment.Status.PENDING)
        attempt.refresh_from_db()
        self.assertEqual(attempt.status, CheckoutAttempt.Status.READY)
