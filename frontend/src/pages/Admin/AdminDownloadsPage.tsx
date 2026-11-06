import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { listAdminDownloadHistory } from '../../api/downloadsApi'
import { Button } from '../../components/ui/Button'
import { AdminIcon } from '../../components/admin/AdminIcon'
import type { DownloadHistoryEntry } from '../../types/download'
import '../../styles/admin-downloads.css'
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
  const [selected, setSelected] = useState<DownloadHistoryEntry | null>(null)
  const debouncedEmail = useDebouncedValue(userEmail)

  const historyQuery = useQuery({
    queryKey: ['admin', 'downloads', 'history', { debouncedEmail, productType, page }],
    queryFn: () =>
      listAdminDownloadHistory({
        user_email: debouncedEmail || undefined,
        product_type: (productType || undefined) as OrderItemProductType | undefined,
        page,
        page_size: 10,
        ordering: '-downloaded_at',
      }),
  })

  const results = historyQuery.data?.results ?? []

  return (
    <main className="dashboard-page admin-downloads-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="admin-downloads-title">
        <nav className="downloads-breadcrumb" aria-label="Breadcrumb"><Link to="/console"><AdminIcon name="home" size={16} /><span className="downloads-sr-only">Admin dashboard</span></Link><span>/</span><span>Downloads</span><span>/</span><strong>Download History</strong></nav>
        <header className="downloads-heading">
          <span className="downloads-heading__icon"><AdminIcon name="download" size={27} /></span>
          <div><h1 id="admin-downloads-title">Download History</h1><p className="home-page__subtitle">Audit trail of customer product and plugin downloads.</p></div>
        </header>

        <div className="admin-filters">
          <div className="downloads-search"><AdminIcon name="search" size={19} /><Input
            value={userEmail}
            onChange={(event) => {
              setUserEmail(event.target.value)
              setPage(1)
            }}
            placeholder="Filter by customer email"
            aria-label="Filter by customer email"
          /></div>
          <select
            className="ui-input"
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
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatLocaleDateTime(entry.downloaded_at)}</td>
                      <td>
                        <div className="downloads-customer">{entry.user_full_name}</div>
                        <div className="home-page__subtitle">{entry.user_email}</div>
                      </td>
                      <td>{formatProductType(entry.product_type)}</td>
                      <td>{entry.file_name}</td>
                      <td>{entry.invoice_number ?? '—'}</td>
                      <td><button className="downloads-view" type="button" onClick={() => setSelected(entry)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="downloads-pagination">
              <span>Showing {(page - 1) * 10 + 1}-{Math.min((page - 1) * 10 + results.length, historyQuery.data?.count ?? 0)} of {historyQuery.data?.count ?? 0} downloads</span>
              <Pagination page={page} totalPages={Math.ceil((historyQuery.data?.count ?? 0) / 10)} onPageChange={setPage} ariaLabel="Download history pagination" />
            </footer>
          </>
        )}

        {selected ? <div className="downloads-dialog-backdrop" onClick={() => setSelected(null)}>
          <section className="downloads-dialog" role="dialog" aria-modal="true" aria-labelledby="download-details-title" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') setSelected(null) }}>
            <h2 id="download-details-title">Download details</h2>
            <dl><dt>Customer</dt><dd>{selected.user_full_name} ({selected.user_email})</dd><dt>Downloaded</dt><dd>{formatLocaleDateTime(selected.downloaded_at)}</dd><dt>Type</dt><dd>{formatProductType(selected.product_type)}</dd><dt>File</dt><dd>{selected.file_name}</dd><dt>Invoice</dt><dd>{selected.invoice_number ?? '-'}</dd></dl>
            <Button type="button" onClick={() => setSelected(null)} autoFocus>Close</Button>
          </section>
        </div> : null}
      </section>
    </main>
  )
}
