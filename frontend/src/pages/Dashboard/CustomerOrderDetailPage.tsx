import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { downloadCatalogFileByUrl } from '../../api/downloadsApi'
import { getCustomerOrder } from '../../api/ordersApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import {
  OrderPaymentStatusBadge,
  OrderStatusBadge,
} from '../../components/ui/StatusBadge'
import { getApiErrorMessage } from '../../lib/apiError'
import { isAdministrator } from '../../lib/roles'
import { useAuthStore } from '../../store/authStore'
import type { CustomerOrderItem } from '../../types/order'
import type { OrderItemDownloadFile } from '../../types/download'

function formatMoney(amount: string, currency: string): string {
  return `${currency} ${amount}`
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatProductType(productType: string): string {
  return productType === 'product' ? 'Product' : 'Plugin'
}

function OrderItemDownloads({
  item,
  onDownload,
}: {
  item: CustomerOrderItem
  onDownload: (file: OrderItemDownloadFile) => Promise<void>
}) {
  if (!item.can_download) {
    return (
      <Button
        type="button"
        variant="secondary"
        disabled
        title="Downloads unlock when order and payment are both paid"
      >
        Download
      </Button>
    )
  }

  if (item.files.length === 0) {
    return <span className="home-page__subtitle">No files</span>
  }

  if (item.files.length === 1) {
    const file = item.files[0]
    return (
      <Button type="button" variant="secondary" onClick={() => void onDownload(file)}>
        Download
      </Button>
    )
  }

  return (
    <div className="dashboard-card__actions">
      {item.files.map((file) => (
        <Button
          key={file.id}
          type="button"
          variant="secondary"
          onClick={() => void onDownload(file)}
        >
          {file.file_name}
        </Button>
      ))}
    </div>
  )
}

export function CustomerOrderDetailPage() {
  const { orderId = '' } = useParams()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const isCustomerSession = isAuthenticated && !isAdministrator(user?.role)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const orderQuery = useQuery({
    queryKey: ['orders', 'detail', orderId],
    queryFn: () => getCustomerOrder(orderId),
    enabled: Boolean(orderId) && isCustomerSession,
  })

  const onDownload = async (file: OrderItemDownloadFile) => {
    setDownloadError(null)
    try {
      await downloadCatalogFileByUrl(file.download_url, file.file_name)
    } catch (error) {
      setDownloadError(
        getApiErrorMessage(error, 'Could not download the file. Please try again.'),
      )
    }
  }

  if (!isCustomerSession) {
    return (
      <main className="dashboard-page">
        <section className="dashboard-card dashboard-card--wide">
          <p className="home-page__subtitle" role="status">
            Order details are available for customer accounts.
          </p>
          <div className="dashboard-card__actions">
            <Link className="home-page__cta home-page__cta--secondary" to="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </section>
      </main>
    )
  }

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
              <Link className="home-page__cta home-page__cta--secondary" to="/dashboard/orders">
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
        <p className="home-page__eyebrow">Customer Dashboard</p>
        <h1 id="order-detail-title">{order.invoice_number}</h1>
        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/dashboard/orders">
            Back to orders
          </Link>
          <Link className="home-page__cta home-page__cta--secondary" to="/dashboard/downloads">
            My downloads
          </Link>
          <Link className="home-page__cta home-page__cta--secondary" to="/dashboard">
            Back to dashboard
          </Link>
        </div>

        <div className="dashboard-card__details">
          <p>
            <strong>Order status:</strong>{' '}
            <OrderStatusBadge status={order.order_status} />
          </p>
          <p>
            <strong>Payment status:</strong>{' '}
            <OrderPaymentStatusBadge status={order.payment_status} />
          </p>
          <p>
            <strong>Total:</strong> {formatMoney(order.total_amount, order.currency)}
          </p>
          <p>
            <strong>Items total:</strong> {formatMoney(order.items_total, order.currency)}
          </p>
          <p>
            <strong>Placed:</strong> {formatDate(order.created_at)}
          </p>
          <p>
            <strong>Updated:</strong> {formatDate(order.updated_at)}
          </p>
        </div>

        <section className="admin-media-section" aria-labelledby="order-items-title">
          <h2 id="order-items-title">Line items</h2>
          {downloadError ? <Alert variant="error" message={downloadError} /> : null}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Title</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Unit price</th>
                  <th scope="col">Line total</th>
                  <th scope="col">Download</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatProductType(item.product_type)}</td>
                    <td>{item.title ?? '—'}</td>
                    <td>{item.quantity}</td>
                    <td>{formatMoney(item.purchase_price, order.currency)}</td>
                    <td>{formatMoney(item.line_total, order.currency)}</td>
                    <td>
                      <OrderItemDownloads item={item} onDownload={onDownload} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {order.items.length === 0 ? (
              <p className="home-page__subtitle">This order has no line items.</p>
            ) : null}
          </div>
          {!order.items.some((item) => item.can_download) ? (
            <p className="home-page__subtitle" role="note">
              Downloads unlock when both order and payment status are paid.
            </p>
          ) : null}
        </section>
      </section>
    </main>
  )
}
