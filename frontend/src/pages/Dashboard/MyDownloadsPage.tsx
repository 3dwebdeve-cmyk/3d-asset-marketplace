import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  downloadCatalogFile,
  listDownloadEntitlements,
  listDownloadHistory,
} from '../../api/downloadsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { formatFileSize } from '../../lib/productUpload'
import { isAdministrator } from '../../lib/roles'
import { useAuthStore } from '../../store/authStore'
import type { DownloadEntitlement, DownloadFile } from '../../types/download'

const PAGE_SIZE = 20

type DownloadsTab = 'library' | 'history'

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

function formatProductType(productType: string): string {
  return productType === 'product' ? 'Product' : 'Plugin'
}

export function MyDownloadsPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const isCustomerSession = isAuthenticated && !isAdministrator(user?.role)

  const [activeTab, setActiveTab] = useState<DownloadsTab>('library')
  const [historyPage, setHistoryPage] = useState(1)
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
      <main className="dashboard-page">
        <section className="dashboard-card dashboard-card--wide">
          <p className="home-page__subtitle" role="status">
            Downloads are available for customer accounts.
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

  const entitlements = entitlementsQuery.data ?? []
  const historyResults = historyQuery.data?.results ?? []
  const libraryRows = entitlements.flatMap((entitlement) =>
    entitlement.files.map((file) => ({ entitlement, file })),
  )

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="downloads-title">
        <p className="home-page__eyebrow">Customer Dashboard</p>
        <h1 id="downloads-title">My Downloads</h1>
        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/dashboard">
            Back to dashboard
          </Link>
          <Link className="home-page__cta home-page__cta--secondary" to="/dashboard/orders">
            My orders
          </Link>
        </div>

        <div className="dashboard-card__actions" role="tablist" aria-label="Downloads views">
          <Button
            type="button"
            variant={activeTab === 'library' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('library')}
            role="tab"
            aria-selected={activeTab === 'library'}
          >
            My library
          </Button>
          <Button
            type="button"
            variant={activeTab === 'history' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('history')}
            role="tab"
            aria-selected={activeTab === 'history'}
          >
            Download history
          </Button>
        </div>

        {downloadError ? <Alert variant="error" message={downloadError} /> : null}

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
            <p className="home-page__subtitle" role="status">
              You do not have any downloadable purchases yet. Completed paid orders will appear
              here.
            </p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
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
        ) : historyQuery.isLoading ? (
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
          <p className="home-page__subtitle" role="status">
            No downloads recorded yet.
          </p>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
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
            <div className="dashboard-card__actions">
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
        )}
      </section>
    </main>
  )
}
