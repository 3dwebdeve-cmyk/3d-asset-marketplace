import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { listAdminDownloadHistory } from '../../api/downloadsApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Input } from '../../components/ui/Input'
import { Pagination } from '../../components/ui/Pagination'
import { Spinner } from '../../components/ui/Spinner'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { getApiErrorMessage } from '../../lib/apiError'
import type { OrderItemProductType } from '../../types/order'
import { formatLocaleDateTime } from '../../lib/format'

function formatProductType(productType: string): string {
  return productType === 'product' ? 'Product' : 'Plugin'
}

export function AdminDownloadsPage() {
  const [userEmail, setUserEmail] = useState('')
  const [productType, setProductType] = useState('')
  const [page, setPage] = useState(1)
  const debouncedEmail = useDebouncedValue(userEmail)

  const historyQuery = useQuery({
    queryKey: ['admin', 'downloads', 'history', { debouncedEmail, productType, page }],
    queryFn: () =>
      listAdminDownloadHistory({
        user_email: debouncedEmail || undefined,
        product_type: (productType || undefined) as OrderItemProductType | undefined,
        page,
        page_size: 20,
        ordering: '-downloaded_at',
      }),
  })

  const results = historyQuery.data?.results ?? []

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="admin-downloads-title">
        <p className="admin-page__eyebrow">Administrator</p>
        <h1 id="admin-downloads-title">Download History</h1>
        <p className="home-page__subtitle">
          Audit trail of customer product and plugin downloads.
        </p>

        <div className="admin-filters">
          <Input
            value={userEmail}
            onChange={(event) => {
              setUserEmail(event.target.value)
              setPage(1)
            }}
            placeholder="Filter by customer email"
            aria-label="Filter by customer email"
          />
          <select
            className="auth-input"
            value={productType}
            onChange={(event) => {
              setProductType(event.target.value)
              setPage(1)
            }}
            aria-label="Filter by product type"
          >
            <option value="">All types</option>
            <option value="product">Products</option>
            <option value="plugin">Plugins</option>
          </select>
        </div>

        {historyQuery.isLoading ? (
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
        ) : results.length === 0 ? (
          <p className="home-page__subtitle" role="status">
            No download records match your filters.
          </p>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Type</th>
                    <th scope="col">File</th>
                    <th scope="col">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatLocaleDateTime(entry.downloaded_at)}</td>
                      <td>
                        <div>{entry.user_full_name}</div>
                        <div className="home-page__subtitle">{entry.user_email}</div>
                      </td>
                      <td>{formatProductType(entry.product_type)}</td>
                      <td>{entry.file_name}</td>
                      <td>{entry.invoice_number ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={Math.ceil((historyQuery.data?.count ?? 0) / 20)}
              onPageChange={setPage}
              ariaLabel="Download history pagination"
            />
          </>
        )}

        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/console">
            Back to admin dashboard
          </Link>
        </div>
      </section>
    </main>
  )
}
