"""Regression coverage for money, credential mutation, and manual publishing."""
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier
from unittest.mock import patch

from django.db import close_old_connections
from django.test import SimpleTestCase, TestCase, TransactionTestCase, override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework.test import APITestCase, APIRequestFactory

from accounts.authentication import VersionedJWTAuthentication
from accounts.models import Role, User
from accounts.services import AuthenticationError, AuthenticationService, PasswordResetService, password_reset_token_generator
from categories.models import Category
from mail_log.models import BackgroundJob
from payments.payment_common import to_cents
from payments.test_payments import PaymentsTestMixin, _FakeEvent, _fake_session
from products.models import Product, ProductFile
from products.services import ProductCreateData, ProductError, ProductService, ProductUpdateData


class CurrencyRegressionTests(SimpleTestCase):
    def test_jpy_is_not_multiplied_by_100(self):
        self.assertEqual(to_cents(Decimal('100.00'), 'JPY'), 100)

    def test_unknown_currency_is_rejected(self):
        with self.assertRaises(ProductError):
            ProductService._normalize_currency('ZZZ')

    def test_fractional_yen_is_rejected(self):
        with self.assertRaises(ValueError):
            to_cents(Decimal('100.50'), 'JPY')

    def test_all_supported_currencies_convert_exactly_in_both_directions(self):
        from config.currency import from_minor_units
        for currency, amount, units in [('USD', '10.25', 1025), ('EUR', '10.25', 1025),
                ('GBP', '10.25', 1025), ('INR', '10.25', 1025), ('JPY', '100', 100)]:
            with self.subTest(currency=currency):
                self.assertEqual(to_cents(Decimal(amount), currency), units)
                self.assertEqual(from_minor_units(units, currency), Decimal(amount))

    def test_bad_amounts_are_rejected_without_rounding(self):
        from config.currency import from_minor_units
        for amount in ['-1', 'NaN', 'Infinity', '1.001']:
            with self.subTest(amount=amount), self.assertRaises(ValueError):
                to_cents(Decimal(amount), 'USD')
        for units in [True, -1, 10.5, '10']:
            with self.subTest(units=units), self.assertRaises(ValueError):
                from_minor_units(units, 'USD')


@override_settings(BACKGROUND_JOBS_TEST_EAGER=False)
class PasswordMutationRegressionTests(TestCase):
    def setUp(self):
        role = Role.objects.get(role_name='Customer')
        self.user = User.objects.create_user(email='mutation@example.com', full_name='Mutation',
                                            password='OriginalPass123!', role=role, email_verified=True)

    def test_stale_user_cannot_roll_back_token_version(self):
        User.objects.filter(pk=self.user.pk).update(token_version=8)
        AuthenticationService.change_password(self.user, 'OriginalPass123!', 'ChangedPass123!')
        self.user.refresh_from_db()
        self.assertEqual(self.user.token_version, 9)

    def test_stale_user_cannot_mutate_deactivated_account(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        with self.assertRaises(AuthenticationError):
            AuthenticationService.change_password(self.user, 'OriginalPass123!', 'ChangedPass123!')

    @patch('config.celery_utils.enqueue_after_commit', side_effect=RuntimeError('outbox unavailable'))
    def test_reset_outbox_failure_does_not_consume_token(self, enqueue):
        uid = urlsafe_base64_encode(force_bytes(str(self.user.pk)))
        token = password_reset_token_generator.make_token(self.user)
        with self.assertRaises(RuntimeError):
            PasswordResetService.confirm_reset(uid, token, 'ChangedPass123!')
        self.user.refresh_from_db()
        self.assertTrue(password_reset_token_generator.check_token(self.user, token))
        self.assertTrue(self.user.check_password('OriginalPass123!'))

    def test_stale_password_cannot_overwrite_new_password(self):
        fresh = User.objects.get(pk=self.user.pk)
        AuthenticationService.change_password(fresh, 'OriginalPass123!', 'ChangedPass123!')
        with self.assertRaises(AuthenticationError):
            AuthenticationService.change_password(self.user, 'OriginalPass123!', 'OtherPass123!')

    @patch('config.celery_utils.enqueue_after_commit', side_effect=RuntimeError('outbox unavailable'))
    def test_failed_outbox_rolls_back_password_and_revocation(self, enqueue):
        tokens = AuthenticationService.build_tokens(self.user)
        with self.assertRaises(RuntimeError):
            AuthenticationService.change_password(self.user, 'OriginalPass123!', 'ChangedPass123!')
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('OriginalPass123!'))
        self.assertEqual(self.user.token_version, 0)
        auth = VersionedJWTAuthentication()
        self.assertEqual(auth.get_user(auth.get_validated_token(tokens['access'])).pk, self.user.pk)
        from rest_framework_simplejwt.tokens import RefreshToken
        RefreshToken(tokens['refresh'])


@override_settings(BACKGROUND_JOBS_TEST_EAGER=False)
class PasswordConcurrencyRegressionTests(TransactionTestCase):
    def setUp(self):
        role, _ = Role.objects.get_or_create(role_name='Customer')
        self.user = User.objects.create_user(email='concurrency@example.com', full_name='Concurrency',
                                            password='OriginalPass123!', role=role, email_verified=True)

    def _concurrent(self, operation):
        barrier = Barrier(2)
        def request(index):
            close_old_connections()
            try:
                # Both requests have the same pre-mutation account snapshot.
                user = User.objects.get(pk=self.user.pk)
                barrier.wait(timeout=10)
                operation(user, index)
                return 'success'
            except AuthenticationError:
                return 'rejected'
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(request, range(2)))

    def test_concurrent_password_changes_consume_old_password_once(self):
        results = self._concurrent(lambda user, i: AuthenticationService.change_password(
            user, 'OriginalPass123!', f'NewPassword{i}123!'))
        self.assertCountEqual(results, ['success', 'rejected'])
        self.user.refresh_from_db()
        self.assertEqual(self.user.token_version, 1)
        self.assertEqual(BackgroundJob.objects.count(), 1)

    def test_concurrent_reset_token_consumed_once(self):
        uid = urlsafe_base64_encode(force_bytes(str(self.user.pk)))
        token = password_reset_token_generator.make_token(self.user)
        results = self._concurrent(lambda user, i: PasswordResetService.confirm_reset(
            uid, token, f'ResetPassword{i}123!'))
        self.assertCountEqual(results, ['success', 'rejected'])
        self.user.refresh_from_db()
        self.assertEqual(self.user.token_version, 1)

    def test_reset_revokes_tokens_issued_by_concurrent_refresh(self):
        from accounts.views import CookieTokenRefreshView
        from django.conf import settings
        from rest_framework_simplejwt.tokens import RefreshToken
        tokens = AuthenticationService.build_tokens(self.user)
        uid = urlsafe_base64_encode(force_bytes(str(self.user.pk)))
        token = password_reset_token_generator.make_token(self.user)
        barrier = Barrier(2)
        def request(index):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                if index == 0:
                    PasswordResetService.confirm_reset(uid, token, 'ChangedPass123!')
                    return None
                raw = APIRequestFactory().post('/api/v1/auth/token/refresh/', {}, format='json')
                raw.COOKIES[settings.JWT_REFRESH_COOKIE_NAME] = tokens['refresh']
                response = CookieTokenRefreshView.as_view()(raw)
                self.assertIn(response.status_code, [200, 401])
                return response.data.get('access')
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(request, range(2)))
        auth = VersionedJWTAuthentication()
        for access in [tokens['access'], results[1]]:
            if access:
                with self.assertRaises(InvalidToken):
                    auth.get_user(auth.get_validated_token(access))
        from rest_framework_simplejwt.exceptions import TokenError
        with self.assertRaises(TokenError):
            RefreshToken(tokens['refresh'])


class PublishRegressionTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name='Publish category', slug='publish-category')
        self.product = Product.objects.create(category=self.category, name='Draft product',
                                              slug='draft-product', price=Decimal('10.00'))

    def test_direct_create_published_is_rejected(self):
        with self.assertRaises(ProductError):
            ProductService.create_product(ProductCreateData(category_id=self.category.pk,
                name='New published product', price=Decimal('10'), status='published'))
        self.assertEqual(Product.objects.count(), 1)

    def test_manual_patch_cannot_publish_without_package(self):
        with self.assertRaises(ProductError):
            ProductService.update_product(self.product, ProductUpdateData(status='published'))
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, 'draft')

    def test_jpy_price_precision_is_validated_on_catalog_write(self):
        with self.assertRaises(ProductError):
            ProductService.update_product(self.product, ProductUpdateData(currency='JPY', price=Decimal('10.25')))
        self.product.refresh_from_db()
        self.assertEqual(self.product.currency, 'USD')

    @patch('products.services.private_object_exists', return_value=True)
    def test_publish_with_existing_package_and_preview_goes_through_review(self, exists):
        ProductFile.objects.create(product=self.product, file_name='model.zip', file_format='zip',
                                   storage_path='products/files/model.zip', file_size=10)
        # A direct publish is refused; the product must be submitted and approved.
        with self.assertRaises(ProductError):
            ProductService.update_product(self.product, ProductUpdateData(
                status='published', preview_model='https://example.com/preview.glb'))
        submitted = ProductService.update_product(self.product, ProductUpdateData(
            status='pending_review', sku='PUB-REVIEW-001', preview_model='https://example.com/preview.glb'))
        published = ProductService.approve_product(submitted, reviewer=None)
        self.assertEqual(published.status, 'published')

    @patch('products.services.private_object_exists', return_value=False)
    def test_missing_storage_object_does_not_publish(self, exists):
        ProductFile.objects.create(product=self.product, file_name='model.zip', file_format='zip',
                                   storage_path='products/files/missing.zip', file_size=10)
        with self.assertRaises(ProductError):
            ProductService.update_product(self.product, ProductUpdateData(
                status='published', preview_model='https://example.com/preview.glb'))
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, 'draft')


@override_settings(STRIPE_SECRET_KEY='sk_test_dummy', E2E_STRIPE_SIMULATE=False)
class CurrencyCommerceRegressionTests(PaymentsTestMixin, APITestCase):
    @patch('payments.checkout_service.stripe.checkout.Session.create', return_value=_fake_session())
    def test_jpy_checkout_fulfillment_and_partial_refund(self, create):
        from payments.checkout_service import CheckoutService
        from payments.webhook_service import WebhookService
        from payments.models import Payment
        self.product.currency = 'JPY'
        self.product.price = Decimal('100')
        self.product.save()
        self._add_to_cart('product', self.product.pk)
        result = CheckoutService.create_checkout_session(self.user)
        self.assertEqual(create.call_args.kwargs['line_items'][0]['price_data']['unit_amount'], 100)
        payment = Payment.objects.get(order_id=result['order_id'])
        WebhookService.handle_event(_FakeEvent('evt_jpy_paid', 'checkout.session.completed', {
            'id': payment.stripe_checkout_session_id, 'payment_intent': 'pi_jpy', 'payment_status': 'paid',
            'amount_total': 100, 'currency': 'jpy', 'client_reference_id': str(self.user.pk),
            'metadata': {'order_id': result['order_id']},
        }))
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'succeeded')
        WebhookService.handle_event(_FakeEvent('evt_jpy_refund', 'charge.refunded', {
            'payment_intent': 'pi_jpy', 'amount_refunded': 25, 'refunded': False,
        }))
        payment.refresh_from_db()
        self.assertEqual(payment.refunded_amount, Decimal('25'))
        self.assertEqual(payment.status, 'succeeded')
        WebhookService.handle_event(_FakeEvent('evt_jpy_full_refund', 'charge.refunded', {
            'payment_intent': 'pi_jpy', 'amount_refunded': 100, 'refunded': True,
        }))
        payment.refresh_from_db()
        self.assertEqual(payment.refunded_amount, Decimal('100'))
        self.assertEqual(payment.status, 'refunded')
        from orders.entitlements import user_owns_catalog_item
        self.assertFalse(user_owns_catalog_item(self.user, 'product', self.product.pk))

    @patch('payments.checkout_service.stripe.checkout.Session.create')
    def test_zero_or_below_minimum_checkout_never_calls_stripe(self, create):
        from payments.checkout_service import CheckoutService
        from payments.payment_common import CheckoutError
        self._add_to_cart('product', self.product.pk)
        for amount in ['0', '0.01']:
            self.product.price = Decimal(amount)
            self.product.save()
            with self.subTest(amount=amount), self.assertRaises(CheckoutError):
                CheckoutService.create_checkout_session(self.user)
        create.assert_not_called()
