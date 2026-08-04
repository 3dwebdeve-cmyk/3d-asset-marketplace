from decimal import Decimal
from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, User
from custom_projects.models import CustomProject, ProjectQuotation
from orders.models import Order, OrderItem
from payments.models import Payment
from payments.test_payments import (
    PaymentsTestMixin,
    _FakeEvent,
    _fake_session,
)


@override_settings(STRIPE_SECRET_KEY="sk_test_dummy", FRONTEND_BASE_URL="http://localhost:5173")
class QuotationCheckoutTests(PaymentsTestMixin, APITestCase):
    def setUp(self) -> None:
        super().setUp()
        cache.clear()
        mail.outbox.clear()
        self.project = CustomProject.objects.create(
            customer=self.user,
            title="Hero prop commission",
            description="Custom hero prop.",
            status=CustomProject.Status.APPROVED,
            payment_status=CustomProject.PaymentStatus.UNPAID,
        )
        self.quotation = ProjectQuotation.objects.create(
            project=self.project,
            amount=Decimal("220.00"),
            currency="USD",
            status=ProjectQuotation.Status.ACCEPTED,
        )
        self.pay_url = reverse(
            "custom_projects:customer-custom-project-quotation-pay",
            kwargs={"project_id": self.project.pk},
        )

    def test_requires_authentication(self) -> None:
        response = self.client.post(self.pay_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_other_customer_gets_404(self) -> None:
        other = User.objects.create_user(
            email="other-quote@example.com",
            full_name="Other Customer",
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
        response = self.client.post(self.pay_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_rejects_pending_quotation(self) -> None:
        self.quotation.status = ProjectQuotation.Status.PENDING
        self.quotation.save(update_fields=["status", "updated_at"])
        self.project.status = CustomProject.Status.QUOTED
        self.project.save(update_fields=["status", "updated_at"])
        self._authenticate()
        response = self.client.post(self.pay_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("payments.services.stripe.checkout.Session.create", return_value=_fake_session("cs_quote_1"))
    def test_creates_order_payment_and_checkout_url(self, mock_create) -> None:
        self._authenticate()
        response = self.client.post(self.pay_url)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("checkout_url", response.data)
        self.assertEqual(response.data["project_id"], str(self.project.pk))
        self.assertTrue(response.data["checkout_url"].startswith("https://checkout.stripe.com/"))

        order = Order.objects.get(pk=response.data["order_id"])
        self.assertEqual(order.total_amount, Decimal("220.00"))
        item = order.items.get()
        self.assertEqual(item.product_type, OrderItem.ProductType.CUSTOM_PROJECT)
        self.assertEqual(item.product_id, self.project.pk)
        self.assertEqual(item.title, "Hero prop commission")

        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(payment.stripe_checkout_session_id, "cs_quote_1")

        self.project.refresh_from_db()
        self.assertEqual(self.project.payment_status, CustomProject.PaymentStatus.PENDING)

        mock_create.assert_called_once()
        kwargs = mock_create.call_args.kwargs
        self.assertEqual(kwargs["metadata"]["checkout_type"], "quotation")
        self.assertIn(f"project_id={self.project.pk}", kwargs["success_url"])

    def test_zero_amount_fulfills_without_stripe(self) -> None:
        self.quotation.amount = Decimal("0.00")
        self.quotation.save(update_fields=["amount", "updated_at"])
        self._authenticate()
        response = self.client.post(self.pay_url)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("/checkout/success", response.data["checkout_url"])

        order = Order.objects.get(pk=response.data["order_id"])
        self.assertEqual(order.order_status, Order.OrderStatus.PAID)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)
        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.status, Payment.Status.SUCCEEDED)

        self.project.refresh_from_db()
        self.assertEqual(self.project.payment_status, CustomProject.PaymentStatus.PAID)
        self.assertEqual(self.project.status, CustomProject.Status.IN_PROGRESS)
        self.assertEqual(len(mail.outbox), 1)

    @patch("payments.services.stripe.checkout.Session.create", return_value=_fake_session("cs_quote_2"))
    def test_rejects_already_paid_project(self, _mock_create) -> None:
        self.project.payment_status = CustomProject.PaymentStatus.PAID
        self.project.status = CustomProject.Status.IN_PROGRESS
        self.project.save(update_fields=["payment_status", "status", "updated_at"])
        self._authenticate()
        response = self.client.post(self.pay_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("payments.services.stripe.checkout.Session.expire")
    @patch("payments.services.stripe.checkout.Session.create")
    def test_recheckout_expires_prior_stripe_session(
        self,
        mock_create,
        mock_expire,
    ) -> None:
        mock_create.side_effect = [
            _fake_session("cs_quote_1"),
            _fake_session("cs_quote_new"),
        ]
        self._authenticate()
        first = self.client.post(self.pay_url)
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        old_order_id = first.data["order_id"]
        old_payment = Payment.objects.get(order_id=old_order_id)
        self.assertEqual(old_payment.stripe_checkout_session_id, "cs_quote_1")

        second = self.client.post(self.pay_url)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(second.data["order_id"], old_order_id)

        mock_expire.assert_called_with("cs_quote_1")
        old_order = Order.objects.get(pk=old_order_id)
        old_payment.refresh_from_db()
        self.assertEqual(old_order.order_status, Order.OrderStatus.CANCELLED)
        self.assertEqual(old_payment.status, Payment.Status.EXPIRED)


@override_settings(STRIPE_WEBHOOK_SECRET="whsec_test", FRONTEND_BASE_URL="http://localhost:5173")
class QuotationWebhookTests(PaymentsTestMixin, APITestCase):
    def setUp(self) -> None:
        super().setUp()
        mail.outbox.clear()
        self.project = CustomProject.objects.create(
            customer=self.user,
            title="Paid commission",
            description="Needs payment webhook.",
            status=CustomProject.Status.APPROVED,
            payment_status=CustomProject.PaymentStatus.PENDING,
        )
        ProjectQuotation.objects.create(
            project=self.project,
            amount=Decimal("99.00"),
            currency="USD",
            status=ProjectQuotation.Status.ACCEPTED,
        )
        self.order = Order.objects.create(
            user=self.user,
            invoice_number="INV-QUOTE-0001",
            total_amount=Decimal("99.00"),
            currency="USD",
        )
        OrderItem.objects.create(
            order=self.order,
            product_type=OrderItem.ProductType.CUSTOM_PROJECT,
            product_id=self.project.pk,
            title="Paid commission",
            slug="paid-commission",
            quantity=1,
            purchase_price=Decimal("99.00"),
        )
        self.payment = Payment.objects.create(
            order=self.order,
            stripe_checkout_session_id="cs_quote_webhook",
            amount=Decimal("99.00"),
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

    def test_checkout_completed_marks_project_paid_and_in_progress(self) -> None:
        event = _FakeEvent(
            "evt_quote_1",
            "checkout.session.completed",
            {"id": "cs_quote_webhook", "payment_intent": "pi_quote_1"},
        )
        response = self._post_webhook(event)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.order.refresh_from_db()
        self.payment.refresh_from_db()
        self.project.refresh_from_db()
        self.assertEqual(self.order.order_status, Order.OrderStatus.PAID)
        self.assertEqual(self.order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(self.payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(self.project.payment_status, CustomProject.PaymentStatus.PAID)
        self.assertEqual(self.project.status, CustomProject.Status.IN_PROGRESS)
        self.assertEqual(len(mail.outbox), 1)

    def test_checkout_expired_reverts_project_to_unpaid(self) -> None:
        event = _FakeEvent(
            "evt_quote_exp",
            "checkout.session.expired",
            {"id": "cs_quote_webhook"},
        )
        response = self._post_webhook(event)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.payment.refresh_from_db()
        self.project.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.EXPIRED)
        self.assertEqual(self.project.payment_status, CustomProject.PaymentStatus.UNPAID)

    def test_stale_superseded_session_does_not_fulfill(self) -> None:
        """Old Stripe session completing after local supersede must not pay the project."""
        self.order.order_status = Order.OrderStatus.CANCELLED
        self.order.payment_status = Order.PaymentStatus.CANCELLED
        self.order.save(update_fields=["order_status", "payment_status", "updated_at"])
        self.payment.status = Payment.Status.EXPIRED
        self.payment.save(update_fields=["status", "updated_at"])
        self.project.payment_status = CustomProject.PaymentStatus.PENDING
        self.project.save(update_fields=["payment_status", "updated_at"])

        event = _FakeEvent(
            "evt_quote_stale",
            "checkout.session.completed",
            {"id": "cs_quote_webhook", "payment_intent": "pi_stale"},
        )
        response = self._post_webhook(event)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.order.refresh_from_db()
        self.payment.refresh_from_db()
        self.project.refresh_from_db()
        self.assertEqual(self.order.order_status, Order.OrderStatus.CANCELLED)
        self.assertEqual(self.payment.status, Payment.Status.EXPIRED)
        self.assertEqual(self.project.payment_status, CustomProject.PaymentStatus.PENDING)
        self.assertEqual(self.project.status, CustomProject.Status.APPROVED)
        self.assertEqual(len(mail.outbox), 0)
