from decimal import Decimal
from unittest.mock import patch

import stripe
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from cart.models import Cart, CartItem
from categories.models import Category
from coupons.models import Coupon
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

    @patch("payments.services.stripe.checkout.Session.create")
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

    @patch("payments.services.stripe.Coupon.create")
    @patch("payments.services.stripe.checkout.Session.create")
    def test_applies_coupon_discount_as_stripe_coupon(
        self,
        mock_session_create,
        mock_coupon_create,
    ) -> None:
        mock_session_create.return_value = _fake_session()
        mock_coupon_create.return_value = _FakeStripeObject({"id": "stripe_coupon_123"})

        coupon = Coupon.objects.create(
            code="SAVE10",
            discount_type=Coupon.DiscountType.FIXED,
            discount_value=Decimal("10.00"),
            active=True,
        )
        self._authenticate()
        self._add_to_cart(CartItem.ProductType.PRODUCT, self.product.pk, quantity=1)
        cart = Cart.objects.get(user=self.user)
        cart.coupon = coupon
        cart.save(update_fields=["coupon"])

        response = self.client.post(self.checkout_url)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mock_coupon_create.assert_called_once()
        self.assertEqual(mock_coupon_create.call_args.kwargs["amount_off"], 1000)

        session_kwargs = mock_session_create.call_args.kwargs
        self.assertEqual(session_kwargs["discounts"], [{"coupon": "stripe_coupon_123"}])

        order = Order.objects.get(pk=response.data["order_id"])
        self.assertEqual(order.total_amount, Decimal("39.99"))
        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.coupon_id, coupon.id)

    @override_settings(STRIPE_SECRET_KEY="")
    def test_returns_error_when_stripe_not_configured(self) -> None:
        self._authenticate()
        self._add_to_cart(CartItem.ProductType.PRODUCT, self.product.pk)
        response = self.client.post(self.checkout_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Order.objects.count(), 0)


@override_settings(STRIPE_WEBHOOK_SECRET="whsec_test")
class StripeWebhookTests(PaymentsTestMixin, APITestCase):
    def setUp(self) -> None:
        super().setUp()
        mail.outbox.clear()
        self.coupon = Coupon.objects.create(
            code="SAVE5",
            discount_type=Coupon.DiscountType.FIXED,
            discount_value=Decimal("5.00"),
            active=True,
        )
        cart, _ = Cart.objects.get_or_create(user=self.user)
        cart.coupon = self.coupon
        cart.save(update_fields=["coupon"])
        self.cart_item = self._add_to_cart(
            CartItem.ProductType.PRODUCT,
            self.product.pk,
            quantity=1,
        )
        self.order = Order.objects.create(
            user=self.user,
            invoice_number="INV-TEST-PAY-0001",
            total_amount=Decimal("44.99"),
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
            coupon=self.coupon,
            stripe_checkout_session_id="cs_test_webhook",
            amount=Decimal("44.99"),
            currency="USD",
            status=Payment.Status.PENDING,
        )

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
            {"id": "cs_test_webhook", "payment_intent": "pi_test_1"},
        )
        response = self._post_webhook(event)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.payment.refresh_from_db()
        self.assertEqual(self.order.order_status, Order.OrderStatus.PAID)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(self.payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(self.payment.stripe_payment_intent_id, "pi_test_1")

        self.coupon.refresh_from_db()
        self.assertEqual(self.coupon.times_used, 1)

        self.assertFalse(
            CartItem.objects.filter(pk=self.cart_item.pk).exists(),
            "purchased cart line should be removed after payment succeeds",
        )
        self.assertEqual(StripeWebhookEvent.objects.count(), 1)

    def test_duplicate_webhook_delivery_is_a_noop(self) -> None:
        event = _FakeEvent(
            "evt_test_dup",
            "checkout.session.completed",
            {"id": "cs_test_webhook", "payment_intent": "pi_test_1"},
        )
        first = self._post_webhook(event)
        second = self._post_webhook(event)

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.coupon.refresh_from_db()
        self.assertEqual(self.coupon.times_used, 1)
        self.assertEqual(StripeWebhookEvent.objects.count(), 1)

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
            {"id": "cs_test_webhook", "payment_intent": "pi_test_receipt"},
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
            {"id": "cs_test_webhook", "payment_intent": "pi_test_fail"},
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
