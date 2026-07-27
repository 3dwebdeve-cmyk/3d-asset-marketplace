import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import {
  downloadCustomerProjectDelivery,
  listCustomerProjectDeliveries,
} from '../../api/customProjectsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { formatFileSize } from '../../lib/productUpload'
import type { ProjectDelivery } from '../../types/customProject'

const DELIVERY_PAGE_SIZE = 50

function formatDeliveryDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

interface CustomerProjectDeliveriesSectionProps {
  projectId: string
}

export function CustomerProjectDeliveriesSection({
  projectId,
}: CustomerProjectDeliveriesSectionProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const deliveriesQuery = useQuery({
    queryKey: ['customer', 'custom-projects', projectId, 'deliveries'],
    queryFn: () =>
      listCustomerProjectDeliveries(projectId, {
        page: 1,
        page_size: DELIVERY_PAGE_SIZE,
      }),
    enabled: Boolean(projectId),
    retry: false,
  })

  const onDownload = async (delivery: ProjectDelivery) => {
    setDownloadError(null)
    try {
      await downloadCustomerProjectDelivery(
        projectId,
        delivery.id,
        delivery.file_name,
      )
    } catch (error) {
      setDownloadError(
        getApiErrorMessage(error, 'Could not download the deliverable. Please try again.'),
      )
    }
  }

  const deliveries = deliveriesQuery.data?.results ?? []

  return (
    <section className="admin-media-section" aria-labelledby="project-deliveries-title">
      <h2 id="project-deliveries-title">Deliverables</h2>
      {downloadError ? <Alert variant="error" message={downloadError} /> : null}
      {deliveriesQuery.isLoading ? (
        <Spinner label="Loading deliverables..." />
      ) : deliveriesQuery.isError ? (
        <ErrorState
          title="Could not load deliverables"
          description={getApiErrorMessage(
            deliveriesQuery.error,
            'Deliverables could not be loaded. Please try again.',
          )}
          action={
            <Button
              variant="secondary"
              isLoading={deliveriesQuery.isFetching}
              onClick={() => deliveriesQuery.refetch()}
            >
              Retry
            </Button>
          }
        />
      ) : deliveries.length ? (
        <ul className="admin-media-list">
          {deliveries.map((delivery) => (
            <li key={delivery.id} className="admin-media-item admin-media-item--file">
              <span className="admin-format-badge admin-format-badge--large">
                v{delivery.version}
              </span>
              <div className="admin-media-item__content">
                <p className="admin-media-item__title">{delivery.file_name}</p>
                <p className="admin-media-item__meta">
                  Version {delivery.version} · {formatFileSize(delivery.file_size)} ·{' '}
                  <time dateTime={delivery.created_at}>
                    {formatDeliveryDate(delivery.created_at)}
                  </time>
                </p>
                {delivery.notes ? (
                  <p className="admin-project-deliveries__notes">{delivery.notes}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onDownload(delivery)}
              >
                Download
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-page__subtitle" role="status">
          No deliverables yet. Your designer will upload final files here when ready.
        </p>
      )}
    </section>
  )
}
