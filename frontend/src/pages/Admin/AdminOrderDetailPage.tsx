import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { getAdminOrder } from '../../api/ordersApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import {
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
} from '../../types/order'

function formatMoney(amount: string, currency: string): string {
  return `${currency} ${amount}`
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function AdminOrderDetailPage() {
  const { orderId = '' } = useParams()

  const orderQuery = useQuery({
    queryKey: ['admin', 'orders', orderId],
    queryFn: () => getAdminOrder(orderId),
    enabled: Boolean(orderId),
  })

  if (orderQuery.isLoading) {
    return (
      <main className="dashboard-page">
        <Spinner fullPage label="Loading order..." />
      </main>
    )
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
              <Link className="home-page__cta home-page__cta--secondary" to="/admin/orders">
                Back to orders
              </Link>
            </div>
          }
        />
      </main>
    )
  }

  const order = orderQuery.data

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="order-detail-title">
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="order-detail-title">{order.invoice_number}</h1>
        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/admin/orders">
            Back to orders
          </Link>
        </div>
        <p className="home-page__subtitle">
          Customer: {order.customer.full_name} ({order.customer.email})
        </p>
        <p className="home-page__subtitle">
          Order: {ORDER_STATUS_LABELS[order.order_status]} · Payment:{' '}
          {ORDER_PAYMENT_STATUS_LABELS[order.payment_status]} · Total:{' '}
          {formatMoney(order.total_amount, order.currency)} · Items total:{' '}
          {formatMoney(order.items_total, order.currency)}
        </p>
        <p className="home-page__subtitle">
          Created {formatDate(order.created_at)} · Updated {formatDate(order.updated_at)}
        </p>

        <section className="admin-media-section" aria-labelledby="order-items-title">
          <h2 id="order-items-title">Line items</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Catalog ID</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Line total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_type}</td>
                    <td>{item.title ?? '—'}</td>
                    <td>{item.product_id}</td>
                    <td>{item.quantity}</td>
                    <td>{formatMoney(item.purchase_price, order.currency)}</td>
                    <td>{formatMoney(item.line_total, order.currency)}</td>
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
