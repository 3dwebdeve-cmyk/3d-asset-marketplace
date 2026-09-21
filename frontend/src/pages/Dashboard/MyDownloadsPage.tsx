import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  downloadCatalogFile,
  listDownloadEntitlements,
  listDownloadHistory,
} from '../../api/downloadsApi'
import { listCustomerOrders } from '../../api/ordersApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import {
  OrderPaymentStatusBadge,
  OrderStatusBadge,
} from '../../components/ui/StatusBadge'
import { getApiErrorMessage } from '../../lib/apiError'
import { formatFileSize } from '../../lib/productUpload'
import { isAdministrator } from '../../lib/roles'
import { useAuthStore } from '../../store/authStore'
import type { DownloadEntitlement, DownloadFile } from '../../types/download'
import {
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  type OrderPaymentStatus,
  type OrderStatus,
} from '../../types/order'

const PAGE_SIZE = 20

type DownloadsTab = 'library' | 'history' | 'invoices'
type StatusFilter = '' | OrderStatus
type PaymentFilter = '' | OrderPaymentStatus

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatMoney(amount: string, currency: string): string {
  return `${currency} ${amount}`
}

function formatProductType(productType: string): string {
  return productType === 'product' ? 'Product' : 'Plugin'
}

export function MyDownloadsPage() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const isCustomerSession = isAuthenticated && !isAdministrator(user?.role)

  const [activeTab, setActiveTab] = useState<DownloadsTab>('library')
  const [historyPage, setHistoryPage] = useState(1)
  const [invoicePage, setInvoicePage] = useState(1)
  const [orderStatus, setOrderStatus] = useState<StatusFilter>('')
  const [paymentStatus, setPaymentStatus] = useState<PaymentFilter>('')
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const entitlementsQuery = useQuery({
    queryKey: ['downloads', 'entitlements'],
    queryFn: listDownloadEntitlements,
    enabled: isCustomerSession,
  })

  const historyQuery = useQuery({
    queryKey: ['downloads', 'history', historyPage],
    queryFn: () => listDownloadHistory({ page: historyPage, page_size: PAGE_SIZE }),
    enabled: isCustomerSession && activeTab === 'history',
  })

  const invoicesQuery = useQuery({
    queryKey: [
      'orders',
      'catalog-invoices',
      { page: invoicePage, orderStatus, paymentStatus },
    ],
    queryFn: () =>
      listCustomerOrders({
        page: invoicePage,
        page_size: PAGE_SIZE,
        ordering: '-created_at',
        item_type: 'catalog',
        order_status: orderStatus || undefined,
        payment_status: paymentStatus || undefined,
      }),
    enabled: isCustomerSession && activeTab === 'invoices',
  })

  useEffect(() => {
    setInvoicePage(1)
  }, [orderStatus, paymentStatus])

  useEffect(() => {
    if (!invoicesQuery.isSuccess || !invoicesQuery.data) return
    if (
      invoicesQuery.data.results.length === 0 &&
      invoicesQuery.data.previous &&
      invoicePage > 1
    ) {
      setInvoicePage((current) => Math.max(1, current - 1))
    }
  }, [invoicesQuery.isSuccess, invoicesQuery.data, invoicePage])

  const onDownload = async (entitlement: DownloadEntitlement, file: DownloadFile) => {
    setDownloadError(null)
    try {
      await downloadCatalogFile(
        entitlement.product_type,
        entitlement.product_id,
        file.id,
        file.file_name,
      )
    } catch (error) {
      setDownloadError(
        getApiErrorMessage(error, 'Could not download the file. Please try again.'),
      )
    }
  }

  if (!isCustomerSession) {
    return (
      <main className="dash-list-page">
        <section className="dash-list-page__card">
          <p className="dash-list-page__status" role="status">
            Downloads are available for customer accounts.
          </p>
        </section>
      </main>
    )
  }

  const entitlements = entitlementsQuery.data ?? []
  const historyResults = historyQuery.data?.results ?? []
  const invoiceResults = invoicesQuery.data?.results ?? []
  const libraryRows = entitlements.flatMap((entitlement) =>
    entitlement.files.map((file) => ({ entitlement, file })),
  )
  const invoicesTrulyEmpty =
    invoicesQuery.isSuccess &&
    !orderStatus &&
    !paymentStatus &&
    (invoicesQuery.data?.count ?? 0) === 0

  return (
    <main className="dash-list-page" aria-labelledby="downloads-title">
      <header className="dash-list-page__header">
        <h1 id="downloads-title" className="dash-list-page__title">
          My Downloads
        </h1>
        <p className="dash-list-page__subtitle">
          Access purchased files, download history, and marketplace invoices.
        </p>
      </header>

      <div className="dash-list-page__actions" role="tablist" aria-label="Downloads views">
        <button
          type="button"
          className={`dash-list-page__btn${activeTab === 'library' ? ' dash-list-page__btn--primary' : ''}`}
          onClick={() => setActiveTab('library')}
          role="tab"
          aria-selected={activeTab === 'library'}
        >
          My library
        </button>
        <button
          type="button"
          className={`dash-list-page__btn${activeTab === 'history' ? ' dash-list-page__btn--primary' : ''}`}
          onClick={() => setActiveTab('history')}
          role="tab"
          aria-selected={activeTab === 'history'}
        >
          Download history
        </button>
        <button
          type="button"
          className={`dash-list-page__btn${activeTab === 'invoices' ? ' dash-list-page__btn--primary' : ''}`}
          onClick={() => setActiveTab('invoices')}
          role="tab"
          aria-selected={activeTab === 'invoices'}
        >
          Invoices
        </button>
      </div>

      {downloadError ? <Alert variant="error" message={downloadError} /> : null}

      {activeTab === 'invoices' && !invoicesTrulyEmpty && !invoicesQuery.isLoading ? (
        <div className="dash-list-page__filters" aria-label="Invoice filters">
          <label className="dash-list-page__filter">
            <span className="dash-list-page__filter-label">Order status</span>
            <select
              className="dash-list-page__filter-select"
              value={orderStatus}
              onChange={(event) => setOrderStatus(event.target.value as StatusFilter)}
            >
              <option value="">All</option>
              {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => (
                <option key={status} value={status}>
                  {ORDER_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="dash-list-page__filter">
            <span className="dash-list-page__filter-label">Payment status</span>
            <select
              className="dash-list-page__filter-select"
              value={paymentStatus}
              onChange={(event) => setPaymentStatus(event.target.value as PaymentFilter)}
            >
              <option value="">All</option>
              {(Object.keys(ORDER_PAYMENT_STATUS_LABELS) as OrderPaymentStatus[]).map(
                (status) => (
                  <option key={status} value={status}>
                    {ORDER_PAYMENT_STATUS_LABELS[status]}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
      ) : null}

      <section className="dash-list-page__card">
        {activeTab === 'library' ? (
          entitlementsQuery.isLoading ? (
            <Spinner label="Loading your library..." />
          ) : entitlementsQuery.isError ? (
            <ErrorState
              title="Could not load downloads"
              description={getApiErrorMessage(
                entitlementsQuery.error,
                'Your download library could not be loaded.',
              )}
              action={
                <Button
                  variant="secondary"
                  isLoading={entitlementsQuery.isFetching}
                  onClick={() => entitlementsQuery.refetch()}
                >
                  Retry
                </Button>
              }
            />
          ) : libraryRows.length === 0 ? (
            <p className="dash-list-page__status" role="status">
              You do not have any downloadable purchases yet. Completed paid orders will appear
              here.
            </p>
          ) : (
            <div className="dash-list-page__table-wrap">
              <table className="dash-list-page__table">
                <thead>
                  <tr>
                    <th scope="col">Type</th>
                    <th scope="col">Title</th>
                    <th scope="col">File</th>
                    <th scope="col">Version</th>
                    <th scope="col">Size</th>
                    <th scope="col">Last downloaded</th>
                    <th scope="col">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {libraryRows.map(({ entitlement, file }) => (
                    <tr key={file.id}>
                      <td>{formatProductType(entitlement.product_type)}</td>
                      <td>{entitlement.title}</td>
                      <td>{file.file_name}</td>
                      <td>{file.version}</td>
                      <td>{formatFileSize(file.file_size)}</td>
                      <td>{formatDateTime(file.last_downloaded_at)}</td>
                      <td>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void onDownload(entitlement, file)}
                        >
                          Download
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : activeTab === 'history' ? (
          historyQuery.isLoading ? (
            <Spinner label="Loading download history..." />
          ) : historyQuery.isError ? (
            <ErrorState
              title="Could not load download history"
              description={getApiErrorMessage(
                historyQuery.error,
                'Download history could not be loaded.',
              )}
              action={
                <Button
                  variant="secondary"
                  isLoading={historyQuery.isFetching}
                  onClick={() => historyQuery.refetch()}
                >
                  Retry
                </Button>
              }
            />
          ) : historyResults.length === 0 ? (
            <p className="dash-list-page__status" role="status">
              No downloads recorded yet.
            </p>
          ) : (
            <>
              <div className="dash-list-page__table-wrap">
                <table className="dash-list-page__table">
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Type</th>
                      <th scope="col">File</th>
                      <th scope="col">Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyResults.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDateTime(entry.downloaded_at)}</td>
                        <td>{formatProductType(entry.product_type)}</td>
                        <td>{entry.file_name}</td>
                        <td>{entry.invoice_number ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dash-list-page__footer" aria-label="History pagination">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!historyQuery.data?.previous}
                  onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!historyQuery.data?.next}
                  onClick={() => setHistoryPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </>
          )
        ) : invoicesQuery.isLoading ? (
          <Spinner label="Loading your invoices..." />
        ) : invoicesQuery.isError ? (
          <ErrorState
            title="Could not load invoices"
            description="Your marketplace invoices could not be loaded. Please try again."
            action={
              <Button
                variant="secondary"
                isLoading={invoicesQuery.isFetching}
                onClick={() => invoicesQuery.refetch()}
              >
                Retry
              </Button>
            }
          />
        ) : invoicesTrulyEmpty ? (
          <p className="dash-list-page__status" role="status">
            You have no marketplace invoices yet. Purchases of models and plugins will appear
            here.
          </p>
        ) : (
          <>
            <div className="dash-list-page__table-wrap">
              <table className="dash-list-page__table">
                <thead>
                  <tr>
                    <th scope="col">Invoice</th>
                    <th scope="col">Date</th>
                    <th scope="col">Total</th>
                    <th scope="col">Order status</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceResults.map((order) => {
                    const detailPath = `/dashboard/orders/${order.id}`
                    return (
                      <tr
                        key={order.id}
                        className="admin-table__row--clickable"
                        tabIndex={0}
                        onClick={() => navigate(detailPath)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            navigate(detailPath)
                          }
                        }}
                      >
                        <td>
                          <Link
                            className="dash-list-page__link"
                            to={detailPath}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {order.invoice_number}
                          </Link>
                        </td>
                        <td>{formatDate(order.created_at)}</td>
                        <td>{formatMoney(order.total_amount, order.currency)}</td>
                        <td>
                          <OrderStatusBadge status={order.order_status} />
                        </td>
                        <td>
                          <OrderPaymentStatusBadge status={order.payment_status} />
                        </td>
                        <td>{order.item_count}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {invoiceResults.length === 0 ? (
                <p className="dash-list-page__status" role="status">
                  No invoices match your filters.
                </p>
              ) : null}
            </div>
            <div className="dash-list-page__footer" aria-label="Invoice pagination">
              <Button
                type="button"
                variant="secondary"
                disabled={!invoicesQuery.data?.previous}
                onClick={() => setInvoicePage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span className="dash-list-page__footer-meta">Page {invoicePage}</span>
              <Button
                type="button"
                variant="secondary"
                disabled={!invoicesQuery.data?.next}
                onClick={() => setInvoicePage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
