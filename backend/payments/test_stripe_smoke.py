"""Phase B1 — sandbox fulfill smoke (signed webhook + idempotency)."""

from __future__ import annotations

from io import StringIO
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.urls import reverse

from accounts.models import User
from cart.models import Cart
from orders.models import Order
from payments.models import Payment, StripeWebhookEvent
from payments.stripe_smoke import (
    sign_stripe_webhook_payload,
    run_sandbox_fulfill_smoke,
    StripeSmokeError,
)
from products.models import Product


class _FakeSession:
    def __init__(self, session_id: str = "cs_test_smoke_session") -> None:
        self.id = session_id
        self.url = f"https://checkout.stripe.com/pay/{session_id}"


@override_settings(
    STRIPE_SECRET_KEY="sk_test_smoke_dummy_key_not_real",
    STRIPE_PUBLISHABLE_KEY="pk_test_smoke_dummy_key",
    STRIPE_WEBHOOK_SECRET="whsec_smoke_test_secret_value",
    E2E_STRIPE_SIMULATE=False,
    FRONTEND_BASE_URL="http://localhost:5173",
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class StripeSmokeFulfillTests(TestCase):
    @patch("payments.checkout_service.stripe.checkout.Session.create")
    @patch("payments.stripe_smoke.stripe.checkout.Session.expire")
    def test_smoke_fulfill_and_idempotent_replay(
        self,
        mock_expire: MagicMock,
        mock_create: MagicMock,
    ) -> None:
        mock_create.return_value = _FakeSession()
        result = run_sandbox_fulfill_smoke(cleanup=True)

        self.assertTrue(result.entitlement_ok)
        self.assertTrue(result.receipt_sent)
        self.assertTrue(result.replay_idempotent)
        self.assertTrue(result.cleaned_up)
        mock_create.assert_called_once()
        mock_expire.assert_called_once_with("cs_test_smoke_session")
        self.assertFalse(
            User.objects.filter(email__startswith="stripe-smoke-").exists()
        )
        self.assertFalse(
            Product.objects.filter(slug__startswith="stripe-smoke-").exists()
        )
        self.assertEqual(StripeWebhookEvent.objects.count(), 0)

    @patch("payments.checkout_service.stripe.checkout.Session.create")
    @patch("payments.stripe_smoke.stripe.checkout.Session.expire")
    def test_keep_smoke_data(
        self,
        mock_expire: MagicMock,
        mock_create: MagicMock,
    ) -> None:
        mock_create.return_value = _FakeSession("cs_test_keep")
        result = run_sandbox_fulfill_smoke(cleanup=False)

        self.assertFalse(result.cleaned_up)
        self.assertTrue(Order.objects.filter(pk=result.order_id).exists())
        self.assertTrue(Payment.objects.filter(pk=result.payment_id).exists())
        payment = Payment.objects.get(pk=result.payment_id)
        self.assertEqual(payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(
            StripeWebhookEvent.objects.filter(stripe_event_id=result.event_id).count(),
            1,
        )
        # Cleanup leftover smoke rows for other tests / DB hygiene.
        StripeWebhookEvent.objects.filter(stripe_event_id=result.event_id).delete()
        Payment.objects.filter(pk=result.payment_id).delete()
        Order.objects.filter(pk=result.order_id).delete()
        Cart.objects.filter(user__email__startswith="stripe-smoke-").delete()
        User.objects.filter(email__startswith="stripe-smoke-").delete()
        Product.objects.filter(slug__startswith="stripe-smoke-").delete()

    def test_refuses_e2e_simulate(self) -> None:
        with override_settings(E2E_STRIPE_SIMULATE=True):
            with self.assertRaises(StripeSmokeError) as ctx:
                run_sandbox_fulfill_smoke()
        self.assertIn("E2E_STRIPE_SIMULATE", str(ctx.exception))

    def test_sign_header_verifies_with_construct_event(self) -> None:
        import stripe

        payload = (
            b'{"id":"evt_x","object":"event","type":"checkout.session.completed",'
            b'"data":{"object":{"id":"cs_x"}}}'
        )
        secret = "whsec_smoke_test_secret_value"
        header = sign_stripe_webhook_payload(payload, secret)
        event = stripe.Webhook.construct_event(payload, header, secret)
        self.assertEqual(event["type"], "checkout.session.completed")

    def test_bad_signature_rejected_by_webhook_view(self) -> None:
        from rest_framework.test import APIClient

        client = APIClient()
        response = client.post(
            reverse("payments:webhook"),
            data=b"{}",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="t=1,v1=deadbeef",
        )
        self.assertEqual(response.status_code, 400)


@override_settings(
    STRIPE_SECRET_KEY="sk_test_smoke_dummy_key_not_real",
    STRIPE_PUBLISHABLE_KEY="pk_test_smoke_dummy_key",
    STRIPE_WEBHOOK_SECRET="whsec_smoke_test_secret_value",
    E2E_STRIPE_SIMULATE=False,
    FRONTEND_BASE_URL="http://localhost:5173",
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class CheckStripeConfigSmokeFlagTests(TestCase):
    @patch("payments.checkout_service.stripe.checkout.Session.create")
    @patch("payments.stripe_smoke.stripe.checkout.Session.expire")
    def test_command_smoke_fulfill(
        self,
        mock_expire: MagicMock,
        mock_create: MagicMock,
    ) -> None:
        mock_create.return_value = _FakeSession()
        out = StringIO()
        call_command(
            "check_stripe_config",
            smoke_fulfill=True,
            fail_on_warnings=True,
            stdout=out,
        )
        text = out.getvalue()
        self.assertIn("smoke_fulfill OK", text)
        self.assertNotIn("sk_test_smoke", text)
        self.assertNotIn("whsec_smoke", text)
        mock_expire.assert_called_once()

    def test_command_smoke_refuses_empty_secret(self) -> None:
        with override_settings(STRIPE_SECRET_KEY=""):
            with self.assertRaises(CommandError):
                call_command("check_stripe_config", smoke_fulfill=True)
