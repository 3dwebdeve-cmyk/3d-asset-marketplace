from decimal import Decimal
from unittest.mock import patch

import stripe
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.legal_service import LegalAcceptanceService
from accounts.models import Role, User
from cart.models import Cart, CartItem
from categories.models import Category
from orders.models import Order, OrderItem
from payments.models import Payment, StripeWebhookEvent
from plugins.models import Plugin, PluginCategory
from products.models import Product


class _FakeStripeObject:
    """Mimics stripe.StripeObject: item/attr access, but no ``.get()`` method."""

    def __init__(self, data: dict) -> None:
        self._data = dict(data)

    def __getitem__(self, key: str):
        return self._data[key]

    def __getattr__(self, item: str):
        try:
            return self._data[item]
        except KeyError as exc:
            raise AttributeError(item) from exc


class _FakeEvent:
    def __init__(self, event_id: str, event_type: str, data_object: dict) -> None:
        self.id = event_id
        self.type = event_type
        self.data = _FakeStripeObject({"object": _FakeStripeObject(data_object)})


class PaymentsTestMixin:
    def setUp(self) -> None:
        cache.clear()
        self.password = "StrongPass123!"
        self.customer_role = Role.objects.get(role_name="Customer")
        self.user = User.objects.create_user(
            email="checkout-customer@example.com",
            full_name="Checkout Customer",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        LegalAcceptanceService.record_acceptances(
            self.user,
            LegalAcceptanceService.current_versions(),
        )

        self.category = Category.objects.create(name="Props", slug="props")
        self.product = Product.objects.create(
            category=self.category,
            name="Hero Sword",
            slug="hero-sword",
            price=Decimal("49.99"),
            status=Product.Status.PUBLISHED,
        )
        self.plugin_category = PluginCategory.objects.create(
            name="Tools",
            slug="tools",
            is_active=True,
        )
        self.plugin = Plugin.objects.create(
            category=self.plugin_category,
            name="UV Toolkit",
            slug="uv-toolkit",
            price=Decimal("24.50"),
            status=Plugin.Status.PUBLISHED,
        )

        self.checkout_url = reverse("payments:checkout")
        self.webhook_url = reverse("payments:webhook")
        self.login_url = reverse("accounts:login")

    def _authenticate(self) -> None:
        response = self.client.post(
            self.login_url,
            {"email": self.user.email, "password": self.password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def _add_to_cart(self, product_type: str, product_id, quantity: int = 1) -> CartItem:
        cart, _ = Cart.objects.get_or_create(user=self.user)
        return CartItem.objects.create(
            cart=cart,
            product_type=product_type,
            product_id=product_id,
            quantity=quantity,
        )


def _fake_session(session_id: str = "cs_test_123") -> _FakeStripeObject:
    return _FakeStripeObject(
        {
            "id": session_id,
            "url": f"https://checkout.stripe.com/pay/{session_id}",
        }
    )


@override_settings(STRIPE_SECRET_KEY="sk_test_dummy")
class CreateCheckoutSessionTests(PaymentsTestMixin, APITestCase):
    def test_requires_authentication(self) -> None:
        response = self.client.post(self.checkout_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_cart_is_rejected(self) -> None:
        self._authenticate()
        response = self.client.post(self.checkout_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("items", response.data)
        self.assertEqual(Order.objects.count(), 0)

    @patch("payments.checkout_service.stripe.checkout.Session.create")
    def test_creates_order_and_session_for_cart(self, mock_session_create) -> None:
        mock_session_create.return_value = _fake_session()
        self._authenticate()
        self._add_to_cart(CartItem.ProductType.PRODUCT, self.product.pk, quantity=2)
        self._add_to_cart(CartItem.ProductType.PLUGIN, self.plugin.pk, quantity=1)

        response = self.client.post(self.checkout_url)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["checkout_url"], _fake_session().url)

        order = Order.objects.get(pk=response.data["order_id"])
        self.assertEqual(order.order_status, Order.OrderStatus.PENDING)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PENDING)
        self.assertEqual(order.total_amount, Decimal("124.48"))
        self.assertEqual(order.items.count(), 2)

        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.stripe_checkout_session_id, "cs_test_123")
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(payment.amount, order.total_amount)

        mock_session_create.assert_called_once()
        call_kwargs = mock_session_create.call_args.kwargs
        self.assertEqual(call_kwargs["mode"], "payment")
        self.assertEqual(len(call_kwargs["line_items"]), 2)
        self.assertIn(f"/checkout/success?order_id={order.id}", call_kwargs["success_url"])
        self.assertIn(f"/checkout/cancel?order_id={order.id}", call_kwargs["cancel_url"])

    @override_settings(STRIPE_SECRET_KEY="")
    def test_returns_error_when_stripe_not_configured(self) -> None:
        self._authenticate()
        self._add_to_cart(CartItem.ProductType.PRODUCT, self.product.pk)
        response = self.client.post(self.checkout_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Order.objects.count(), 0)

    @override_settings(
        E2E_STRIPE_SIMULATE=True,
        STRIPE_SECRET_KEY="sk_test_e2e_dummy",
        FRONTEND_BASE_URL="http://localhost:8080",
    )
    def test_e2e_simulate_returns_success_url_without_stripe_api(self) -> None:
        self._authenticate()
        self._add_to_cart(CartItem.ProductType.PRODUCT, self.product.pk)

        with patch("payments.checkout_service.stripe.checkout.Session.create") as mock_create:
            response = self.client.post(self.checkout_url)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mock_create.assert_not_called()
        order = Order.objects.get(pk=response.data["order_id"])
        self.assertIn(
            f"/checkout/success?order_id={order.id}",
            response.data["checkout_url"],
        )
        payment = Payment.objects.get(order=order)
        self.assertTrue(payment.stripe_checkout_session_id.startswith("cs_test_e2e_"))

    @patch("payments.checkout_service.stripe.checkout.Session.create")
    def test_idempotency_key_replays_same_checkout(self, mock_session_create) -> None:
        mock_session_create.return_value = _fake_session("cs_idem_1")
        self._authenticate()
        self._add_to_cart(CartItem.ProductType.PRODUCT, self.product.pk, quantity=1)

        headers = {"HTTP_IDEMPOTENCY_KEY": "checkout-retry-1"}
        first = self.client.post(self.checkout_url, **headers)
        second = self.client.post(self.checkout_url, **headers)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(first.data, second.data)
        self.assertEqual(Order.objects.count(), 1)
        mock_session_create.assert_called_once()

    @override_settings(STRIPE_SECRET_KEY="sk_test_dummy")
    @patch("payments.checkout_service.stripe.checkout.Session.create")
    def test_checkout_requires_legal_acceptance(self, mock_session_create) -> None:
        from accounts.models import LegalAcceptance

        mock_session_create.return_value = _fake_session("cs_legal_1")
        LegalAcceptance.objects.filter(user=self.user).delete()
        self._authenticate()
        self._add_to_cart(CartItem.ProductType.PRODUCT, self.product.pk)

        blocked = self.client.post(self.checkout_url)
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(blocked.data.get("code"), "legal_acceptance_required")
        self.assertIn("accepted_legal", blocked.data)
        self.assertEqual(Order.objects.count(), 0)
        mock_session_create.assert_not_called()

        allowed = self.client.post(
            self.checkout_url,
            {
                "accepted_legal": {
                    "terms": "2026-09-18",
                    "privacy": "2026-09-18",
                },
            },
            format="json",
        )
        self.assertEqual(allowed.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Order.objects.count(), 1)
        mock_session_create.assert_called_once()


@override_settings(STRIPE_WEBHOOK_SECRET="whsec_test")
class StripeWebhookTests(PaymentsTestMixin, APITestCase):
    def setUp(self) -> None:
        super().setUp()
        mail.outbox.clear()
        self.cart_item = self._add_to_cart(
            CartItem.ProductType.PRODUCT,
            self.product.pk,
            quantity=1,
        )
        self.order = Order.objects.create(
            user=self.user,
            invoice_number="INV-TEST-PAY-0001",
            total_amount=Decimal("49.99"),
            currency="USD",
        )
        OrderItem.objects.create(
            order=self.order,
            product_type=OrderItem.ProductType.PRODUCT,
            product_id=self.product.pk,
            title="Hero Sword",
            slug="hero-sword",
            quantity=1,
            purchase_price=Decimal("49.99"),
        )
        self.payment = Payment.objects.create(
            order=self.order,
            stripe_checkout_session_id="cs_test_webhook",
            amount=Decimal("49.99"),
            currency="USD",
            status=Payment.Status.PENDING,
        )

    def _paid_checkout_session(self, **overrides) -> dict:
        data = {
            "id": self.payment.stripe_checkout_session_id,
            "payment_intent": "pi_test_1",
            "payment_status": "paid",
            "amount_total": 4999,
            "currency": "usd",
            "client_reference_id": str(self.user.pk),
            "metadata": {"order_id": str(self.order.pk)},
        }
        data.update(overrides)
        return data

    def _post_webhook(self, event):
        with patch("payments.views.stripe.Webhook.construct_event", return_value=event):
            return self.client.post(
                self.webhook_url,
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="test_sig",
            )

    def test_checkout_completed_marks_order_and_payment_paid(self) -> None:
        event = _FakeEvent(
            "evt_test_1",
            "checkout.session.completed",
            self._paid_checkout_session(),
        )
        response = self._post_webhook(event)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.payment.refresh_from_db()
        self.assertEqual(self.order.order_status, Order.OrderStatus.PAID)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(self.payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(self.payment.stripe_payment_intent_id, "pi_test_1")

        self.assertFalse(
            CartItem.objects.filter(pk=self.cart_item.pk).exists(),
            "purchased cart line should be removed after payment succeeds",
        )
        self.assertEqual(StripeWebhookEvent.objects.count(), 1)

    def test_unpaid_checkout_completed_does_not_grant_entitlement(self) -> None:
        event = _FakeEvent(
            "evt_test_unpaid",
            "checkout.session.completed",
            self._paid_checkout_session(
                payment_status="unpaid",
                payment_intent=None,
            ),
        )

        response = self._post_webhook(event)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.payment.refresh_from_db()
        self.assertEqual(self.order.order_status, Order.OrderStatus.PENDING)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PENDING)
        self.assertEqual(self.payment.status, Payment.Status.PENDING)
        self.assertTrue(CartItem.objects.filter(pk=self.cart_item.pk).exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_async_payment_success_fulfills_after_unpaid_completion(self) -> None:
        unpaid = _FakeEvent(
            "evt_test_async_pending",
            "checkout.session.completed",
            self._paid_checkout_session(
                payment_status="unpaid",
                payment_intent=None,
            ),
        )
        succeeded = _FakeEvent(
            "evt_test_async_succeeded",
            "checkout.session.async_payment_succeeded",
            self._paid_checkout_session(payment_intent="pi_test_async"),
        )

        self.assertEqual(self._post_webhook(unpaid).status_code, status.HTTP_200_OK)
        self.assertEqual(self._post_webhook(succeeded).status_code, status.HTTP_200_OK)

        self.order.refresh_from_db()
        self.payment.refresh_from_db()
        self.assertEqual(self.order.order_status, Order.OrderStatus.PAID)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(self.payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(self.payment.stripe_payment_intent_id, "pi_test_async")
        self.assertFalse(CartItem.objects.filter(pk=self.cart_item.pk).exists())
        self.assertEqual(StripeWebhookEvent.objects.count(), 2)

    def test_checkout_fulfillment_rejects_mismatched_session_data(self) -> None:
        scenarios = {
            "order metadata": {
                "metadata": {
                    "order_id": "00000000-0000-0000-0000-000000000099"
                }
            },
            "customer reference": {
                "client_reference_id": "00000000-0000-0000-0000-000000000098"
            },
            "amount": {"amount_total": 1},
            "currency": {"currency": "eur"},
        }

        for index, (label, overrides) in enumerate(scenarios.items(), start=1):
            with self.subTest(label):
                event = _FakeEvent(
                    f"evt_test_mismatch_{index}",
                    "checkout.session.completed",
                    self._paid_checkout_session(**overrides),
                )
                response = self._post_webhook(event)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.order.refresh_from_db()
                self.payment.refresh_from_db()
                self.assertEqual(self.order.order_status, Order.OrderStatus.PENDING)
                self.assertEqual(self.order.payment_status, Order.PaymentStatus.PENDING)
                self.assertEqual(self.payment.status, Payment.Status.PENDING)

        self.assertTrue(CartItem.objects.filter(pk=self.cart_item.pk).exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_duplicate_webhook_delivery_is_a_noop(self) -> None:
        event = _FakeEvent(
            "evt_test_dup",
            "checkout.session.completed",
            self._paid_checkout_session(),
        )
        first = self._post_webhook(event)
        second = self._post_webhook(event)

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(StripeWebhookEvent.objects.count(), 1)

    def test_documented_webhook_event_types_match_handlers(self) -> None:
        from payments.webhook_service import STRIPE_WEBHOOK_EVENT_TYPES

        self.assertEqual(
            STRIPE_WEBHOOK_EVENT_TYPES,
            frozenset(
                {
                    "checkout.session.completed",
                    "checkout.session.async_payment_succeeded",
                    "checkout.session.async_payment_failed",
                    "checkout.session.expired",
                    "payment_intent.payment_failed",
                    "charge.refunded",
                    "charge.dispute.created",
                    "charge.dispute.closed",
                }
            ),
        )

    def test_invalid_signature_is_rejected(self) -> None:
        with patch(
            "payments.views.stripe.Webhook.construct_event",
            side_effect=stripe.error.SignatureVerificationError("bad sig", "sig_header"),
        ):
            response = self.client.post(
                self.webhook_url,
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="bad_sig",
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(STRIPE_WEBHOOK_SECRET="")
    def test_returns_503_when_webhook_secret_not_configured(self) -> None:
        response = self.client.post(
            self.webhook_url,
            data=b"{}",
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="test_sig",
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_checkout_completed_sends_payment_receipt_email(self) -> None:
        event = _FakeEvent(
            "evt_test_receipt",
            "checkout.session.completed",
            self._paid_checkout_session(payment_intent="pi_test_receipt"),
        )
        response = self._post_webhook(event)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, [self.user.email])
        self.assertIn(self.order.invoice_number, email.subject)
        self.assertIn("Payment received", email.subject)
        self.assertIn(self.order.invoice_number, email.body)
        self.assertEqual(len(email.attachments), 1)
        filename, content, mimetype = email.attachments[0]
        self.assertIn(self.order.invoice_number, filename)
        self.assertEqual(mimetype, "application/pdf")
        self.assertTrue(content.startswith(b"%PDF"))

    def test_receipt_email_failure_does_not_leave_order_unpaid(self) -> None:
        event = _FakeEvent(
            "evt_test_receipt_fail",
            "checkout.session.completed",
            self._paid_checkout_session(payment_intent="pi_test_fail"),
        )
        with patch(
            "orders.notifications.EmailMessage.send",
            side_effect=RuntimeError("smtp down"),
        ):
            response = self._post_webhook(event)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.payment.refresh_from_db()
        self.assertEqual(self.order.order_status, Order.OrderStatus.PAID)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(self.payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(len(mail.outbox), 0)

    def _mark_paid_with_intent(self, intent_id: str = "pi_test_refund") -> None:
        self.order.order_status = Order.OrderStatus.PAID
        self.order.payment_status = Order.PaymentStatus.PAID
        self.order.save(update_fields=["order_status", "payment_status", "updated_at"])
        self.payment.status = Payment.Status.SUCCEEDED
        self.payment.stripe_payment_intent_id = intent_id
        self.payment.save(
            update_fields=["status", "stripe_payment_intent_id", "updated_at"]
        )

    def test_charge_refunded_marks_order_and_revokes_entitlement(self) -> None:
        from orders.entitlements import user_owns_catalog_item

        self._mark_paid_with_intent("pi_test_refund")
        self.assertTrue(
            user_owns_catalog_item(
                self.user,
                OrderItem.ProductType.PRODUCT,
                self.product.pk,
            )
        )

        event = _FakeEvent(
            "evt_test_refund",
            "charge.refunded",
            {
                "id": "ch_test_refund",
                "payment_intent": "pi_test_refund",
                "refunded": True,
            },
        )
        response = self._post_webhook(event)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.order.refresh_from_db()
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.REFUNDED)
        self.assertEqual(self.order.order_status, Order.OrderStatus.REFUNDED)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.REFUNDED)
        self.assertFalse(
            user_owns_catalog_item(
                self.user,
                OrderItem.ProductType.PRODUCT,
                self.product.pk,
            )
        )
        self.assertEqual(StripeWebhookEvent.objects.count(), 1)

    def test_duplicate_charge_refunded_is_a_noop(self) -> None:
        self._mark_paid_with_intent("pi_test_refund_dup")
        event = _FakeEvent(
            "evt_test_refund_dup",
            "charge.refunded",
            {
                "id": "ch_test_refund_dup",
                "payment_intent": "pi_test_refund_dup",
                "refunded": True,
            },
        )
        first = self._post_webhook(event)
        second = self._post_webhook(event)
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.REFUNDED)
        self.assertEqual(StripeWebhookEvent.objects.count(), 1)

    def test_partial_charge_refunded_is_ignored(self) -> None:
        self._mark_paid_with_intent("pi_test_partial")
        event = _FakeEvent(
            "evt_test_partial",
            "charge.refunded",
            {
                "id": "ch_test_partial",
                "payment_intent": "pi_test_partial",
                "refunded": False,
                "amount_refunded": 100,
            },
        )
        response = self._post_webhook(event)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(self.order.order_status, Order.OrderStatus.PAID)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)

    def test_charge_refunded_unknown_intent_requests_retry(self) -> None:
        self._mark_paid_with_intent("pi_test_known")
        event = _FakeEvent(
            "evt_test_unknown_pi",
            "charge.refunded",
            {
                "id": "ch_unknown",
                "payment_intent": "pi_does_not_exist",
                "refunded": True,
            },
        )
        response = self._post_webhook(event)
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(StripeWebhookEvent.objects.count(), 0)

    @patch("payments.webhook_service.stripe.Dispute.retrieve")
    def test_dispute_revokes_access_and_won_dispute_restores_it(self, retrieve):
        from orders.entitlements import user_owns_catalog_item

        self._mark_paid_with_intent("pi_disputed")
        retrieve.return_value = {"id": "dp_test", "status": "needs_response"}
        dispute = {"id": "dp_test", "payment_intent": "pi_disputed"}
        self.assertEqual(self._post_webhook(_FakeEvent(
            "evt_dispute_created", "charge.dispute.created", dispute,
        )).status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.DISPUTED)
        self.assertFalse(user_owns_catalog_item(self.user, "product", self.product.pk))
        retrieve.return_value = {"id": "dp_test", "status": "won"}
        self.assertEqual(self._post_webhook(_FakeEvent(
            "evt_dispute_won", "charge.dispute.closed", dispute,
        )).status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.SUCCEEDED)

    def test_partial_refund_amount_is_recorded(self):
        self._mark_paid_with_intent("pi_partial_audit")
        event = _FakeEvent("evt_partial_audit", "charge.refunded", {
            "id": "ch_partial", "payment_intent": "pi_partial_audit",
            "refunded": False, "amount_refunded": 100,
        })
        self.assertEqual(self._post_webhook(event).status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.refunded_amount, Decimal("1.00"))
        self.assertEqual(self.payment.status, Payment.Status.SUCCEEDED)


@override_settings(STRIPE_SECRET_KEY="sk_test_dummy")
class ConfirmCheckoutSessionTests(PaymentsTestMixin, APITestCase):
    def setUp(self) -> None:
        super().setUp()
        self.confirm_url = reverse("payments:confirm")
        self.order = Order.objects.create(
            user=self.user,
            invoice_number="INV-CONFIRM-1",
            total_amount=Decimal("49.99"),
            currency="USD",
        )
        OrderItem.objects.create(
            order=self.order,
            product_type=OrderItem.ProductType.PRODUCT,
            product_id=self.product.pk,
            title=self.product.name,
            slug=self.product.slug,
            quantity=1,
            purchase_price=Decimal("49.99"),
        )
        self.payment = Payment.objects.create(
            order=self.order,
            stripe_checkout_session_id="cs_test_confirm",
            amount=Decimal("49.99"),
            currency="USD",
            status=Payment.Status.PENDING,
        )

    def test_requires_authentication(self) -> None:
        response = self.client.post(
            self.confirm_url,
            {"order_id": str(self.order.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_other_users_order_returns_404(self) -> None:
        other = User.objects.create_user(
            email="other-confirm@example.com",
            full_name="Other",
            password=self.password,
            role=self.customer_role,
            email_verified=True,
        )
        login = self.client.post(
            self.login_url,
            {"email": other.email, "password": self.password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        response = self.client.post(
            self.confirm_url,
            {"order_id": str(self.order.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("payments.checkout_service.stripe.checkout.Session.retrieve")
    def test_confirms_paid_stripe_session_and_fulfills_order(self, mock_retrieve) -> None:
        mock_retrieve.return_value = _FakeStripeObject(
            {
                "id": "cs_test_confirm",
                "status": "complete",
                "payment_status": "paid",
                "payment_intent": "pi_confirm_1",
                "amount_total": 4999,
                "currency": "usd",
                "client_reference_id": str(self.user.pk),
                "metadata": _FakeStripeObject({"order_id": str(self.order.pk)}),
            }
        )
        self._authenticate()
        response = self.client.post(
            self.confirm_url,
            {"order_id": str(self.order.pk)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["payment_status"], Order.PaymentStatus.PAID)
        self.order.refresh_from_db()
        self.payment.refresh_from_db()
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(self.order.order_status, Order.OrderStatus.PAID)
        self.assertEqual(self.payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(self.payment.stripe_payment_intent_id, "pi_confirm_1")

    @patch("payments.checkout_service.stripe.checkout.Session.retrieve")
    def test_unpaid_stripe_session_leaves_order_pending(self, mock_retrieve) -> None:
        mock_retrieve.return_value = _FakeStripeObject(
            {
                "id": "cs_test_confirm",
                "status": "open",
                "payment_status": "unpaid",
                "payment_intent": None,
                "metadata": _FakeStripeObject({"order_id": str(self.order.pk)}),
            }
        )
        self._authenticate()
        response = self.client.post(
            self.confirm_url,
            {"order_id": str(self.order.pk)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["payment_status"], Order.PaymentStatus.PENDING)
        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PENDING)

    @patch("payments.checkout_service.stripe.checkout.Session.retrieve")
    def test_rejects_metadata_order_mismatch(self, mock_retrieve) -> None:
        mock_retrieve.return_value = _FakeStripeObject(
            {
                "id": "cs_test_confirm",
                "status": "complete",
                "payment_status": "paid",
                "payment_intent": "pi_mismatch",
                "metadata": _FakeStripeObject(
                    {"order_id": "00000000-0000-0000-0000-000000000099"}
                ),
            }
        )
        self._authenticate()
        response = self.client.post(
            self.confirm_url,
            {"order_id": str(self.order.pk)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PENDING)

    @patch("payments.checkout_service.stripe.checkout.Session.retrieve")
    def test_rejects_empty_metadata_order_id(self, mock_retrieve) -> None:
        mock_retrieve.return_value = _FakeStripeObject(
            {
                "id": "cs_test_confirm",
                "status": "complete",
                "payment_status": "paid",
                "payment_intent": "pi_empty_meta",
                "metadata": _FakeStripeObject({}),
            }
        )
        self._authenticate()
        response = self.client.post(
            self.confirm_url,
            {"order_id": str(self.order.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PENDING)

    @override_settings(
        E2E_STRIPE_SIMULATE=True,
        STRIPE_SECRET_KEY="sk_test_e2e_dummy",
    )
    def test_e2e_simulate_confirm_fulfills_without_stripe_retrieve(self) -> None:
        self.payment.stripe_checkout_session_id = "cs_test_e2e_confirm_fixture"
        self.payment.save(update_fields=["stripe_checkout_session_id", "updated_at"])
        self._authenticate()

        with patch("payments.checkout_service.stripe.checkout.Session.retrieve") as mock_retrieve:
            response = self.client.post(
                self.confirm_url,
                {"order_id": str(self.order.pk)},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_retrieve.assert_not_called()
        self.order.refresh_from_db()
        self.payment.refresh_from_db()
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(self.order.order_status, Order.OrderStatus.PAID)
        self.assertEqual(self.payment.status, Payment.Status.SUCCEEDED)

    def test_rejects_cancelled_order(self) -> None:
        self.order.order_status = Order.OrderStatus.CANCELLED
        self.order.payment_status = Order.PaymentStatus.CANCELLED
        self.order.save(update_fields=["order_status", "payment_status", "updated_at"])
        self.payment.status = Payment.Status.EXPIRED
        self.payment.save(update_fields=["status", "updated_at"])
        self._authenticate()
        response = self.client.post(
            self.confirm_url,
            {"order_id": str(self.order.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
