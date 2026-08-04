import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { getCustomerOrder } from '../../api/ordersApi'
import { confirmCheckoutSession } from '../../api/paymentsApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { OrderPaymentStatusBadge } from '../../components/ui/StatusBadge'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 45_000

export function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('order_id') ?? ''
  const projectId = searchParams.get('project_id') ?? ''
  const queryClient = useQueryClient()
  const startedAtRef = useRef(Date.now())
  const confirmAttemptedRef = useRef(false)

  useDocumentSeo({
    title: 'Checkout confirmation | 3D Asset Marketplace',
    description: 'Private checkout confirmation. This page is not indexed by search engines.',
    robots: 'noindex, nofollow',
  })

  const orderQuery = useQuery({
    queryKey: ['orders', 'detail', orderId],
    queryFn: () => getCustomerOrder(orderId),
    enabled: Boolean(orderId),
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data || data.payment_status === 'pending') {
        return Date.now() - startedAtRef.current < POLL_TIMEOUT_MS ? POLL_INTERVAL_MS : false
      }
      return false
    },
  })

  const order = orderQuery.data
  const isPaid = order?.payment_status === 'paid'
  const hasTimedOut =
    Boolean(order) &&
    order?.payment_status === 'pending' &&
    Date.now() - startedAtRef.current >= POLL_TIMEOUT_MS
  const isQuotationCheckout = Boolean(projectId)

  useEffect(() => {
    if (!orderId || !order || order.payment_status !== 'pending' || hasTimedOut) {
      return
    }
    if (confirmAttemptedRef.current) {
      return
    }
    confirmAttemptedRef.current = true

    void confirmCheckoutSession(orderId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] })
      })
      .catch(() => {
        confirmAttemptedRef.current = false
      })
  }, [orderId, order, hasTimedOut, queryClient])

  useEffect(() => {
    if (isPaid) {
      void queryClient.invalidateQueries({ queryKey: ['cart'] })
      if (projectId) {
        void queryClient.invalidateQueries({
          queryKey: ['customer', 'custom-projects'],
        })
      }
    }
  }, [isPaid, projectId, queryClient])

  if (!orderId) {
    return (
      <main className="dashboard-page">
        <ErrorState
          title="Missing order"
          description="We couldn't find which order this checkout belongs to."
          action={
            <Link className="home-page__cta" to="/cart">
              Back to cart
            </Link>
          }
        />
      </main>
    )
  }

  if (orderQuery.isLoading) {
    return (
      <main className="dashboard-page">
        <Spinner fullPage label="Confirming your payment..." />
      </main>
    )
  }

  if (orderQuery.isError || !order) {
    return (
      <main className="dashboard-page">
        <ErrorState
          title="Could not load your order"
          description="Your payment may still have succeeded. Check your order history for the latest status."
          action={
            <div className="dashboard-card__actions">
              <Button variant="secondary" onClick={() => orderQuery.refetch()}>
                Retry
              </Button>
              <Link className="home-page__cta home-page__cta--secondary" to="/dashboard/orders">
                My orders
              </Link>
            </div>
          }
        />
      </main>
    )
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="checkout-success-title">
        <p className="home-page__eyebrow">Checkout</p>
        <h1 id="checkout-success-title">
          {isPaid ? 'Payment successful' : 'Confirming your payment...'}
        </h1>

        <div className="dashboard-card__details">
          <p>
            <strong>Invoice:</strong> {order.invoice_number}
          </p>
          <p>
            <strong>Total:</strong> {order.currency} {order.total_amount}
          </p>
          <p>
            <strong>Payment status:</strong>{' '}
            <OrderPaymentStatusBadge status={order.payment_status} />
          </p>
        </div>

        {isPaid ? (
          <>
            <p className="home-page__subtitle" role="status">
              {isQuotationCheckout
                ? 'Thanks for paying your quotation. Your project team can continue the work.'
                : 'Thanks for your purchase! Your items are ready to download.'}
            </p>
            <div className="dashboard-card__actions">
              {isQuotationCheckout ? (
                <Link className="home-page__cta" to={`/dashboard/projects/${projectId}`}>
                  Back to project
                </Link>
              ) : (
                <Link className="home-page__cta" to="/dashboard/downloads">
                  My downloads
                </Link>
              )}
              <Link
                className="home-page__cta home-page__cta--secondary"
                to={`/dashboard/orders/${order.id}`}
              >
                View order
              </Link>
            </div>
          </>
        ) : hasTimedOut ? (
          <>
            <p className="home-page__subtitle" role="status">
              This is taking longer than expected. Your payment may still be processing — check
              back in a moment.
            </p>
            <div className="dashboard-card__actions">
              <Button
                variant="secondary"
                onClick={() => {
                  void confirmCheckoutSession(orderId)
                    .then(() => orderQuery.refetch())
                    .catch(() => orderQuery.refetch())
                }}
              >
                Check again
              </Button>
              <Link
                className="home-page__cta home-page__cta--secondary"
                to={`/dashboard/orders/${order.id}`}
              >
                View order
              </Link>
            </div>
          </>
        ) : (
          <Spinner label="Waiting for payment confirmation..." />
        )}
      </section>
    </main>
  )
}
