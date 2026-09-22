import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { getAdminPayment } from '../../api/paymentsApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage, isHttpNotFound } from '../../lib/apiError'
import {
  PAYMENT_STATUS_LABELS,
  type PaymentStatus,
} from '../../types/payment'
import { formatMoneyPlain, formatLocaleDateTime } from '../../lib/format'
import { NotFoundPage } from '../NotFound/NotFoundPage'

export function AdminPaymentDetailPage() {
  const { paymentId = '' } = useParams()

  const paymentQuery = useQuery({
    queryKey: ['admin', 'payments', paymentId],
    queryFn: () => getAdminPayment(paymentId),
    enabled: Boolean(paymentId),
  })

  if (paymentQuery.isLoading) {
    return (
      <main className="dashboard-page">
        <Spinner fullPage label="Loading payment..." />
      </main>
    )
  }

  if (!paymentId || isHttpNotFound(paymentQuery.error)) {
    return <NotFoundPage />
  }

  if (paymentQuery.isError || !paymentQuery.data) {
    return (
      <main className="dashboard-page">
        <ErrorState
          title="Could not load payment"
          description={getApiErrorMessage(
            paymentQuery.error,
            'This payment could not be loaded or does not exist.',
          )}
          action={
            <div className="dashboard-card__actions">
              <Button variant="secondary" onClick={() => paymentQuery.refetch()}>
                Retry
              </Button>
              <Link
                className="home-page__cta home-page__cta--secondary"
                to="/console/payments"
              >
                Back to payments
              </Link>
            </div>
          }
        />
      </main>
    )
  }

  const payment = paymentQuery.data
  const statusLabel =
    PAYMENT_STATUS_LABELS[payment.status as PaymentStatus] ?? payment.status

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="payment-detail-title"
      >
        <p className="admin-page__eyebrow">Administrator</p>
        <h1 id="payment-detail-title">Payment {payment.id}</h1>
        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/console/payments">
            Back to payments
          </Link>
          <Link
            className="home-page__cta home-page__cta--secondary"
            to={`/console/orders/${payment.order.id}`}
          >
            View order
          </Link>
        </div>

        <p className="home-page__subtitle">
          Customer: {payment.customer_full_name} ({payment.customer_email})
        </p>
        <p className="home-page__subtitle">
          Status: {statusLabel} · Gateway: {payment.gateway} · Amount:{' '}
          {formatMoneyPlain(payment.amount, payment.currency)}
        </p>
        <p className="home-page__subtitle">
          Created {formatLocaleDateTime(payment.created_at)} · Updated{' '}
          {formatLocaleDateTime(payment.updated_at)}
        </p>

        <section className="admin-media-section" aria-labelledby="payment-order-title">
          <h2 id="payment-order-title">Linked order</h2>
          <p className="home-page__subtitle">
            Invoice {payment.order.invoice_number} · Order status:{' '}
            {payment.order.order_status} · Payment status:{' '}
            {payment.order.payment_status} · Total:{' '}
            {formatMoneyPlain(payment.order.total_amount, payment.order.currency)}
          </p>
        </section>

        <section className="admin-media-section" aria-labelledby="payment-stripe-title">
          <h2 id="payment-stripe-title">Stripe references</h2>
          <p className="home-page__subtitle">
            Checkout session: <code>{payment.stripe_checkout_session_id}</code>
          </p>
          <p className="home-page__subtitle">
            Payment intent:{' '}
            <code>{payment.stripe_payment_intent_id || 'Not available yet'}</code>
          </p>
        </section>
      </section>
    </main>
  )
}
