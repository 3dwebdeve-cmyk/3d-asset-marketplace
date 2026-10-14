import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  downloadAdminOrderInvoice,
  getAdminOrder,
  updateAdminOrderStatus,
} from '../../api/ordersApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage, isHttpNotFound } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import {
  ADMIN_MANUAL_STATUS_TARGETS,
  ALLOWED_ORDER_STATUS_TRANSITIONS,
  ALLOWED_PAYMENT_STATUS_TRANSITIONS,
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  type AdminOrderStatusUpdatePayload,
  type OrderPaymentStatus,
  type OrderStatus,
} from '../../types/order'
import { formatMoneyPlain, formatLocaleDateTime } from '../../lib/format'
import { NotFoundPage } from '../NotFound/NotFoundPage'

function statusActionLabel(
  field: 'order_status' | 'payment_status',
  next: OrderStatus | OrderPaymentStatus,
): string {
  const labels = field === 'order_status' ? ORDER_STATUS_LABELS : ORDER_PAYMENT_STATUS_LABELS
  const prefix = field === 'order_status' ? 'Order' : 'Payment'
  return `Set ${prefix.toLowerCase()} → ${labels[next]}`
}

export function AdminOrderDetailPage() {
  const { orderId = '' } = useParams()
  const queryClient = useQueryClient()
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false)

  const orderQuery = useQuery({
    queryKey: ['admin', 'orders', orderId],
    queryFn: () => getAdminOrder(orderId),
    enabled: Boolean(orderId),
  })

  const statusMutation = useMutation({
    mutationFn: (payload: AdminOrderStatusUpdatePayload) =>
      updateAdminOrderStatus(orderId, payload),
    onSuccess: async (order) => {
      queryClient.setQueryData(['admin', 'orders', orderId], order)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
      toast.success('Order status updated.')
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not update order status.'))
    },
  })

  const onDownloadInvoice = async () => {
    if (!orderQuery.data) return
    setInvoiceError(null)
    setIsDownloadingInvoice(true)
    try {
      await downloadAdminOrderInvoice(orderQuery.data.id, orderQuery.data.invoice_number)
    } catch (error) {
      setInvoiceError(
        getApiErrorMessage(error, 'Could not download the invoice. Please try again.'),
      )
    } finally {
      setIsDownloadingInvoice(false)
    }
  }

  if (orderQuery.isLoading) {
    return (
      <main className="dashboard-page">
        <Spinner fullPage label="Loading order..." />
      </main>
    )
  }

  if (!orderId || isHttpNotFound(orderQuery.error)) {
    return <NotFoundPage />
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <main className="dashboard-page">
        <ErrorState
          title="Could not load order"
          description="This order could not be loaded or does not exist."
          action={
            <div className="dashboard-card__actions">
              <Button variant="secondary" onClick={() => orderQuery.refetch()}>
                Retry
              </Button>
              <Link className="home-page__cta home-page__cta--secondary" to="/console/orders">
                Back to orders
              </Link>
            </div>
          }
        />
      </main>
    )
  }

  const order = orderQuery.data
  const orderTransitions = ALLOWED_ORDER_STATUS_TRANSITIONS[order.order_status].filter(
    (next) => ADMIN_MANUAL_STATUS_TARGETS.has(next),
  )
  const paymentTransitions = ALLOWED_PAYMENT_STATUS_TRANSITIONS[order.payment_status].filter(
    (next) => ADMIN_MANUAL_STATUS_TARGETS.has(next),
  )
  const canDownloadInvoice =
    order.order_status === 'paid' && order.payment_status === 'paid'
  const isUpdating = statusMutation.isPending

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="order-detail-title">
        <p className="admin-page__eyebrow">Administrator</p>
        <h1 id="order-detail-title">{order.invoice_number}</h1>
        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/console/orders">
            Back to orders
          </Link>
          {canDownloadInvoice ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isDownloadingInvoice}
              onClick={() => void onDownloadInvoice()}
            >
              {isDownloadingInvoice ? 'Downloading…' : 'Download invoice'}
            </Button>
          ) : null}
        </div>
        {invoiceError ? <Alert variant="error" message={invoiceError} /> : null}
        <p className="home-page__subtitle">
          Customer: {order.customer.full_name} ({order.customer.email})
        </p>
        <p className="home-page__subtitle">
          Order: {ORDER_STATUS_LABELS[order.order_status]} · Payment:{' '}
          {ORDER_PAYMENT_STATUS_LABELS[order.payment_status]} · Total:{' '}
          {formatMoneyPlain(order.total_amount, order.currency)} · Items total:{' '}
          {formatMoneyPlain(order.items_total, order.currency)}
        </p>
        <p className="home-page__subtitle">
          Created {formatLocaleDateTime(order.created_at)} · Updated {formatLocaleDateTime(order.updated_at)}
        </p>

        {orderTransitions.length > 0 || paymentTransitions.length > 0 ? (
          <section
            className="admin-media-section"
            aria-labelledby="order-status-actions-title"
          >
            <h2 id="order-status-actions-title">Status transitions</h2>
            <p className="home-page__subtitle">
              Only transitions allowed by the order service are shown.
            </p>
            <div className="dashboard-card__actions">
              {orderTransitions.map((next) => (
                <Button
                  key={`order-${next}`}
                  variant="secondary"
                  disabled={isUpdating}
                  onClick={() => statusMutation.mutate({ order_status: next })}
                >
                  {statusActionLabel('order_status', next)}
                </Button>
              ))}
              {paymentTransitions.map((next) => (
                <Button
                  key={`payment-${next}`}
                  variant="secondary"
                  disabled={isUpdating}
                  onClick={() => statusMutation.mutate({ payment_status: next })}
                >
                  {statusActionLabel('payment_status', next)}
                </Button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="admin-media-section" aria-labelledby="order-items-title">
          <h2 id="order-items-title">Line items</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Slug</th>
                  <th>Catalog ID</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Line total</th>
                  <th>License</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_type}</td>
                    <td>{item.title ?? '—'}</td>
                    <td>{item.slug ?? '—'}</td>
                    <td>{item.product_id}</td>
                    <td>{item.quantity}</td>
                    <td>{formatMoneyPlain(item.purchase_price, order.currency)}</td>
                    <td>{formatMoneyPlain(item.line_total, order.currency)}</td>
                    <td>{item.license_code ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {order.items.length === 0 ? (
              <p className="home-page__subtitle">This order has no line items.</p>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  )
}
