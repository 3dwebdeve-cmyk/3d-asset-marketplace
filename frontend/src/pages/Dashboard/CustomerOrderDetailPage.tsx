import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { getCustomerOrder } from '../../api/ordersApi'
import { OrderItemDownloads } from '../../components/orders/OrderItemDownloads'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import {
  OrderPaymentStatusBadge,
  OrderStatusBadge,
} from '../../components/ui/StatusBadge'
import { useOrderDownloads } from '../../hooks/useOrderDownloads'
import { isHttpNotFound } from '../../lib/apiError'
import { formatLocaleDateTime, formatMoneyPlain } from '../../lib/format'
import { isAdministrator } from '../../lib/roles'
import { useAuthStore } from '../../store/authStore'
import '../../styles/invoice-card.css'
import { NotFoundPage } from '../NotFound/NotFoundPage'

function formatProductType(productType: string): string {
  if (productType === 'product') return 'Product'
  if (productType === 'plugin') return 'Plugin'
  return 'Custom project'
}

function ProductThumb({ productType }: { productType: string }) {
  if (productType === 'plugin') {
    return (
      <div className="invoice-card__thumb" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      </div>
    )
  }

  return (
    <div className="invoice-card__thumb" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 19v3M18 19v3M7 11h10M7 4h10v7H7zM7 11v8h10v-8" />
      </svg>
    </div>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export function CustomerOrderDetailPage() {
  useDocumentSeo({
    title: 'Order details | AssetHive 3D',
    description: 'View the details and downloads for your AssetHive 3D order.',
    robots: 'noindex, nofollow',
  })

  const { orderId = '' } = useParams()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const isCustomerSession = isAuthenticated && !isAdministrator(user?.role)
  const {
    downloadFile,
    downloadInvoice,
    downloadLicense,
    fileError: downloadError,
    invoiceError,
    downloadingFileId,
    downloadingInvoiceId,
    downloadingLicenseId,
  } = useOrderDownloads()

  const orderQuery = useQuery({
    queryKey: ['orders', 'detail', orderId],
    queryFn: () => getCustomerOrder(orderId),
    enabled: Boolean(orderId) && isCustomerSession,
  })

  if (!isCustomerSession) {
    return (
      <main className="dashboard-page">
        <section className="invoice-card">
          <p className="invoice-card__muted" role="status">
            Order details are available for customer accounts.
          </p>
          <div className="invoice-card__actions">
            <Link className="invoice-card__btn-back" to="/dashboard/orders">
              <BackIcon />
              <span>Back to orders</span>
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
            <div className="invoice-card__actions">
              <Button variant="secondary" onClick={() => orderQuery.refetch()}>
                Retry
              </Button>
              <Link className="invoice-card__btn-back" to="/dashboard/orders">
                <BackIcon />
                <span>Back to orders</span>
              </Link>
            </div>
          }
        />
      </main>
    )
  }

  const order = orderQuery.data
  const canDownloadInvoice =
    order.order_status === 'paid' && order.payment_status === 'paid'
  const isDownloadingInvoice = downloadingInvoiceId === order.id

  return (
    <main className="dashboard-page">
      <section className="invoice-card" aria-labelledby="order-detail-title">
        <p className="invoice-card__eyebrow">Customer Dashboard</p>
        <h1 id="order-detail-title" className="invoice-card__title">
          {order.invoice_number}
        </h1>

        <div className="invoice-card__actions">
          <Link className="invoice-card__btn-back" to="/dashboard/orders">
            <BackIcon />
            <span>Back to orders</span>
          </Link>
          {canDownloadInvoice ? (
            <button
              type="button"
              className="invoice-card__btn-download"
              disabled={isDownloadingInvoice}
              onClick={() => void downloadInvoice(order.id, order.invoice_number)}
            >
              <DownloadIcon />
              <span>{isDownloadingInvoice ? 'Downloading…' : 'Download invoice'}</span>
            </button>
          ) : null}
        </div>

        {invoiceError ? (
          <div className="invoice-card__alert">
            <Alert variant="error" message={invoiceError} />
          </div>
        ) : null}

        <div className="invoice-card__meta">
          <div className="invoice-card__meta-row">
            <span className="invoice-card__meta-label">Order status:</span>
            <span className="invoice-card__meta-value">
              <OrderStatusBadge status={order.order_status} />
            </span>
          </div>
          <div className="invoice-card__meta-row">
            <span className="invoice-card__meta-label">Payment status:</span>
            <span className="invoice-card__meta-value">
              <OrderPaymentStatusBadge status={order.payment_status} />
            </span>
          </div>
          <div className="invoice-card__meta-row">
            <span className="invoice-card__meta-label">Total:</span>
            <span className="invoice-card__meta-value">
              {formatMoneyPlain(order.total_amount, order.currency)}
            </span>
          </div>
          <div className="invoice-card__meta-row">
            <span className="invoice-card__meta-label">Items total:</span>
            <span className="invoice-card__meta-value">
              {formatMoneyPlain(order.items_total, order.currency)}
            </span>
          </div>
          <div className="invoice-card__meta-row">
            <span className="invoice-card__meta-label">Placed:</span>
            <span className="invoice-card__meta-value">
              {formatLocaleDateTime(order.created_at)}
            </span>
          </div>
          <div className="invoice-card__meta-row">
            <span className="invoice-card__meta-label">Updated:</span>
            <span className="invoice-card__meta-value">
              {formatLocaleDateTime(order.updated_at)}
            </span>
          </div>
        </div>

        <hr className="invoice-card__divider" />

        <h2 id="order-items-title" className="invoice-card__section-title">
          Line items
        </h2>
        {downloadError ? (
          <div className="invoice-card__alert">
            <Alert variant="error" message={downloadError} />
          </div>
        ) : null}

        <div className="invoice-card__table-wrap">
          <table className="invoice-card__table">
            <thead>
              <tr>
                <th scope="col" style={{ width: '14%' }}>
                  Type
                </th>
                <th scope="col" style={{ width: '30%' }}>
                  Title
                </th>
                <th scope="col" style={{ width: '10%' }}>
                  Qty
                </th>
                <th scope="col" style={{ width: '15%' }}>
                  Unit price
                </th>
                <th scope="col" style={{ width: '15%' }}>
                  Line total
                </th>
                <th scope="col" style={{ width: '16%' }}>
                  Download
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{formatProductType(item.product_type)}</td>
                  <td>
                    <div className="invoice-card__product">
                      <ProductThumb productType={item.product_type} />
                      <span className="invoice-card__product-name">{item.title ?? '—'}</span>
                    </div>
                  </td>
                  <td>{item.quantity}</td>
                  <td>{formatMoneyPlain(item.purchase_price, order.currency)}</td>
                  <td>{formatMoneyPlain(item.line_total, order.currency)}</td>
                  <td>
                    <OrderItemDownloads
                      item={item}
                      onDownload={downloadFile}
                      downloadingFileId={downloadingFileId}
                    />
                    {item.can_download ? (
                      <button
                        type="button"
                        className="invoice-card__download-btn"
                        disabled={downloadingLicenseId === item.id}
                        title="License certificate (PDF) for this item"
                        onClick={() =>
                          void downloadLicense(
                            order.id,
                            item.id,
                            `license-${order.invoice_number}-${item.slug ?? item.id}.pdf`,
                          )
                        }
                      >
                        {downloadingLicenseId === item.id ? 'Downloading…' : 'License'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {order.items.length === 0 ? (
            <p className="invoice-card__muted">This order has no line items.</p>
          ) : null}
        </div>

        {!order.items.some((item) => item.can_download) ? (
          <p className="invoice-card__note" role="note">
            Downloads unlock when both order and payment status are paid.
          </p>
        ) : null}
      </section>
    </main>
  )
}
