import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { getCustomerOrder } from '../../api/ordersApi'
import { confirmCheckoutSession } from '../../api/paymentsApi'
import { OrderItemDownloads } from '../../components/orders/OrderItemDownloads'
import { Alert } from '../../components/ui/Alert'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import {
  clearCheckoutOrderId,
  peekCheckoutOrderId,
} from '../../lib/checkoutReturn'
import { formatFileSize } from '../../lib/format'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { useOrderDownloads } from '../../hooks/useOrderDownloads'
import { ORDER_PAYMENT_STATUS_LABELS } from '../../types/order'
import type { CustomerOrder, OrderPaymentStatus } from '../../types/order'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 45_000

const CONFETTI_DOTS = 11

function PaymentStatusPill({ status }: { status: OrderPaymentStatus }) {
  const modifier =
    status === 'paid'
      ? ''
      : status === 'pending'
        ? ' checkout-success-page__status-pill--pending'
        : ' checkout-success-page__status-pill--danger'

  return (
    <span className={`checkout-success-page__status-pill${modifier}`}>
      {ORDER_PAYMENT_STATUS_LABELS[status]}
    </span>
  )
}

function SuccessBadge() {
  return (
    <div className="checkout-success-page__badge-wrap" aria-hidden="true">
      {Array.from({ length: CONFETTI_DOTS }, (_, i) => (
        <span
          key={i}
          className={`checkout-success-page__confetti checkout-success-page__confetti--${i + 1}`}
        />
      ))}
      <div className="checkout-success-page__outer-ring">
        <div className="checkout-success-page__inner-circle">
          <svg viewBox="0 0 24 24">
            <path className="checkout-success-page__check-path" d="M5 12.5L9.5 17L19 7.5" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function PendingBadge() {
  return (
    <div className="checkout-success-page__badge-wrap" aria-hidden="true">
      <div className="checkout-success-page__outer-ring checkout-success-page__outer-ring--pending">
        <div className="checkout-success-page__inner-circle checkout-success-page__inner-circle--pending">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" fill="#ffffff" stroke="none" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function PurchasedDownloads({
  order,
  onDownload,
  downloadingFileId,
}: {
  order: CustomerOrder
  onDownload: ReturnType<typeof useOrderDownloads>['downloadFile']
  downloadingFileId: string | null
}) {
  return (
    <section
      className="checkout-success-page__downloads"
      aria-labelledby="checkout-success-downloads-title"
    >
      <h2 id="checkout-success-downloads-title" className="checkout-success-page__downloads-title">
        Your downloads
      </h2>
      <ul className="checkout-success-page__download-list">
        {order.items.map((item) => {
          const singleFile = item.files.length === 1 ? item.files[0] : null
          return (
            <li key={item.id} className="checkout-success-page__download-item">
              <div className="checkout-success-page__download-info">
                <span className="checkout-success-page__download-name">
                  {item.title ?? 'Purchased item'}
                </span>
                {singleFile ? (
                  <span className="checkout-success-page__download-meta">
                    {singleFile.file_format.toUpperCase()} · {formatFileSize(singleFile.file_size)}
                  </span>
                ) : null}
              </div>
              <OrderItemDownloads
                item={item}
                onDownload={onDownload}
                downloadingFileId={downloadingFileId}
                classBlock="checkout-success-page"
                emptyLabel="Files are being prepared"
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams()
  const orderIdFromUrl = searchParams.get('order_id') ?? ''
  const orderId = orderIdFromUrl || peekCheckoutOrderId() || ''
  const queryClient = useQueryClient()
  const startedAtRef = useRef(Date.now())
  const confirmAttemptedRef = useRef(false)
  const {
    downloadFile,
    downloadInvoice,
    fileError,
    invoiceError,
    downloadingFileId,
    downloadingInvoiceId,
  } = useOrderDownloads()

  useDocumentSeo({
    title: 'Checkout confirmation | 3D Asset Marketplace',
    description: 'Private checkout confirmation. This page is not indexed by search engines.',
    robots: 'noindex, nofollow',
  })

  useEffect(() => {
    if (orderIdFromUrl) {
      clearCheckoutOrderId()
    }
  }, [orderIdFromUrl])

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
      void queryClient.invalidateQueries({ queryKey: ['downloads'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({
        queryKey: ['orders'],
        predicate: (query) => query.queryKey[1] !== 'detail' || query.queryKey[2] !== orderId,
      })
    }
  }, [isPaid, orderId, queryClient])

  if (!orderId) {
    return (
      <main className="checkout-success-page">
        <div className="checkout-success-page__container">
          <ErrorState
            title="Missing order"
            description="We couldn't find which order this checkout belongs to."
            action={
              <Link className="checkout-success-page__btn checkout-success-page__btn--primary" to="/cart">
                Back to cart
              </Link>
            }
          />
        </div>
      </main>
    )
  }

  if (orderQuery.isLoading) {
    return (
      <main className="checkout-success-page">
        <Spinner fullPage label="Confirming your payment..." />
      </main>
    )
  }

  if (orderQuery.isError || !order) {
    return (
      <main className="checkout-success-page">
        <div className="checkout-success-page__container">
          <ErrorState
            title="Could not load your order"
            description="Your payment may still have succeeded. Check your order history for the latest status."
            action={
              <div className="checkout-success-page__actions">
                <button
                  type="button"
                  className="checkout-success-page__btn checkout-success-page__btn--secondary"
                  onClick={() => orderQuery.refetch()}
                >
                  Retry
                </button>
                <Link
                  className="checkout-success-page__btn checkout-success-page__btn--secondary"
                  to="/dashboard/orders"
                >
                  My orders
                </Link>
              </div>
            }
          />
        </div>
      </main>
    )
  }

  return (
    <main className="checkout-success-page">
      <div className="checkout-success-page__container">
        <article
          className="checkout-success-page__card"
          aria-labelledby="checkout-success-title"
        >
          {isPaid ? <SuccessBadge /> : <PendingBadge />}

          <div className="checkout-success-page__content">
            <h1 id="checkout-success-title" className="checkout-success-page__title">
              {isPaid ? (
                <>
                  Your payment successfully
                  <br />
                  processed
                </>
              ) : (
                'Confirming your payment...'
              )}
            </h1>

            <div className="checkout-success-page__invoice">
              <p className="checkout-success-page__invoice-row">
                <span className="checkout-success-page__invoice-label">Invoice:</span>
                <span className="checkout-success-page__invoice-val">{order.invoice_number}</span>
              </p>
              <p className="checkout-success-page__invoice-row">
                <span className="checkout-success-page__invoice-label">Total:</span>
                <span className="checkout-success-page__invoice-val">
                  {order.currency} {order.total_amount}
                </span>
              </p>
              <p className="checkout-success-page__invoice-row">
                <span className="checkout-success-page__invoice-label">Payment status:</span>
                <PaymentStatusPill status={order.payment_status} />
              </p>
            </div>

            {isPaid ? (
              <>
                <p className="checkout-success-page__thankyou" role="status">
                  Thanks for your purchase! Your items are ready to download.
                </p>
                <PurchasedDownloads
                  order={order}
                  onDownload={downloadFile}
                  downloadingFileId={downloadingFileId}
                />
                {fileError ? (
                  <div className="checkout-success-page__alert">
                    <Alert variant="error" message={fileError} />
                  </div>
                ) : null}
                {invoiceError ? (
                  <div className="checkout-success-page__alert">
                    <Alert variant="error" message={invoiceError} />
                  </div>
                ) : null}
                <div className="checkout-success-page__actions">
                  {order.order_status === 'paid' ? (
                    <button
                      type="button"
                      className="checkout-success-page__btn checkout-success-page__btn--primary"
                      disabled={downloadingInvoiceId === order.id}
                      onClick={() => void downloadInvoice(order.id, order.invoice_number)}
                    >
                      {downloadingInvoiceId === order.id ? 'Downloading…' : 'Download invoice'}
                    </button>
                  ) : null}
                  <Link
                    className="checkout-success-page__btn checkout-success-page__btn--secondary"
                    to={`/dashboard/orders/${order.id}`}
                  >
                    View order
                  </Link>
                </div>
                <Link className="checkout-success-page__text-link" to="/dashboard/downloads">
                  Go to my library
                </Link>
              </>
            ) : hasTimedOut ? (
              <>
                <p className="checkout-success-page__thankyou" role="status">
                  This is taking longer than expected. Your payment may still be processing — check
                  back in a moment.
                </p>
                <div className="checkout-success-page__actions">
                  <button
                    type="button"
                    className="checkout-success-page__btn checkout-success-page__btn--primary"
                    onClick={() => {
                      void confirmCheckoutSession(orderId)
                        .then(() => orderQuery.refetch())
                        .catch(() => orderQuery.refetch())
                    }}
                  >
                    Check again
                  </button>
                  <Link
                    className="checkout-success-page__btn checkout-success-page__btn--secondary"
                    to={`/dashboard/orders/${order.id}`}
                  >
                    View order
                  </Link>
                </div>
              </>
            ) : (
              <div className="checkout-success-page__pending-spot">
                <Spinner label="Waiting for payment confirmation..." />
              </div>
            )}
          </div>
        </article>
      </div>
    </main>
  )
}
