import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import {
  downloadCatalogFile,
  listDownloadEntitlements,
  listDownloadHistory,
} from '../../api/downloadsApi'
import { listCustomerOrders } from '../../api/ordersApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Pagination } from '../../components/ui/Pagination'
import { Spinner } from '../../components/ui/Spinner'
import {
  OrderPaymentStatusBadge,
  OrderStatusBadge,
} from '../../components/ui/StatusBadge'
import { useOrderDownloads } from '../../hooks/useOrderDownloads'
import { getApiErrorMessage } from '../../lib/apiError'
import { isAdministrator } from '../../lib/roles'
import { useAuthStore } from '../../store/authStore'
import type { DownloadEntitlement, DownloadFile } from '../../types/download'
import {
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  type OrderPaymentStatus,
  type OrderStatus,
} from '../../types/order'
import { formatMoneyPlain, formatDate, formatDateTime, formatFileSize } from '../../lib/format'

const PAGE_SIZE = 20

type DownloadsTab = 'library' | 'history' | 'invoices'
type StatusFilter = '' | OrderStatus
type PaymentFilter = '' | OrderPaymentStatus

const DOWNLOADS_TABS: readonly DownloadsTab[] = ['library', 'history', 'invoices']

function parseTab(value: string | null): DownloadsTab {
  return DOWNLOADS_TABS.includes(value as DownloadsTab) ? (value as DownloadsTab) : 'library'
}

function formatProductType(productType: string): string {
  return productType === 'product' ? 'Product' : 'Plugin'
}

export function MyDownloadsPage() {
  useDocumentSeo({
    title: 'My downloads | AssetHive 3D',
    description: 'Download the 3D models and plugins you have purchased.',
    robots: 'noindex, nofollow',
  })

  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const isCustomerSession = isAuthenticated && !isAdministrator(user?.role)

  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseTab(searchParams.get('tab'))
  const setActiveTab = (tab: DownloadsTab) => {
    setSearchParams(tab === 'library' ? {} : { tab }, { replace: true })
  }
  const { downloadInvoice, invoiceError, downloadingInvoiceId } = useOrderDownloads()
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
    if (entitlement.product_type !== 'product' && entitlement.product_type !== 'plugin') {
      setDownloadError('This entitlement cannot be downloaded from the catalog library.')
      return
    }
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
  type LibraryRow = { entitlement: DownloadEntitlement; file: DownloadFile | null }
  const libraryRows = entitlements.flatMap<LibraryRow>((entitlement) =>
    entitlement.files.length > 0
      ? entitlement.files.map((file) => ({ entitlement, file }))
      : [{ entitlement, file: null }],
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
      {activeTab === 'invoices' && invoiceError ? (
        <Alert variant="error" message={invoiceError} />
      ) : null}

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
                  {libraryRows.map(({ entitlement, file }) =>
                    file ? (
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
                    ) : (
                      <tr key={`${entitlement.product_type}-${entitlement.product_id}`}>
                        <td>{formatProductType(entitlement.product_type)}</td>
                        <td>{entitlement.title}</td>
                        <td colSpan={5}>No downloadable files yet. Please contact support.</td>
                      </tr>
                    ),
                  )}
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
              <Pagination
                page={historyPage}
                totalPages={Math.ceil((historyQuery.data?.count ?? 0) / PAGE_SIZE)}
                onPageChange={setHistoryPage}
                ariaLabel="History pagination"
              />
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
                    <th scope="col">Invoice PDF</th>
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
                        <td>{formatMoneyPlain(order.total_amount, order.currency)}</td>
                        <td>
                          <OrderStatusBadge status={order.order_status} />
                        </td>
                        <td>
                          <OrderPaymentStatusBadge status={order.payment_status} />
                        </td>
                        <td>{order.item_count}</td>
                        <td>
                          {order.order_status === 'paid' && order.payment_status === 'paid' ? (
                            <Button
                              type="button"
                              variant="secondary"
                              isLoading={downloadingInvoiceId === order.id}
                              aria-label={`Download invoice ${order.invoice_number}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                void downloadInvoice(order.id, order.invoice_number)
                              }}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              Download
                            </Button>
                          ) : (
                            '—'
                          )}
                        </td>
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
            <Pagination
              page={invoicePage}
              totalPages={Math.ceil((invoicesQuery.data?.count ?? 0) / PAGE_SIZE)}
              onPageChange={setInvoicePage}
              ariaLabel="Invoice pagination"
            />
          </>
        )}
      </section>
    </main>
  )
}
