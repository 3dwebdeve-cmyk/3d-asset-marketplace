import type { ReactNode } from 'react'

import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { ErrorState } from '../ui/ErrorState'
import { Spinner } from '../ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { formatDateTime, formatFileSize } from '../../lib/format'
import type { ProjectDelivery } from '../../types/customProject'

export const PROJECT_DELIVERY_PAGE_SIZE = 50

interface ProjectDeliveriesListProps {
  titleId: string
  listLabel?: string
  deliveries: ProjectDelivery[]
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  error: unknown
  emptyMessage: string
  downloadError: string | null
  onRetry: () => void
  onDownload: (delivery: ProjectDelivery) => void
  /** When true, append uploaded_by_email to the meta line (admin). */
  showUploaderEmail?: boolean
  footer?: ReactNode
}

export function ProjectDeliveriesList({
  titleId,
  listLabel = 'Project deliverables',
  deliveries,
  isLoading,
  isError,
  isFetching,
  error,
  emptyMessage,
  downloadError,
  onRetry,
  onDownload,
  showUploaderEmail = false,
  footer,
}: ProjectDeliveriesListProps) {
  return (
    <>
      {downloadError ? <Alert variant="error" message={downloadError} /> : null}
      {isLoading ? (
        <Spinner label="Loading deliverables..." />
      ) : isError ? (
        <ErrorState
          title="Could not load deliverables"
          description={getApiErrorMessage(
            error,
            'Deliverables could not be loaded. Please try again.',
          )}
          action={
            <Button variant="secondary" isLoading={isFetching} onClick={onRetry}>
              Retry
            </Button>
          }
        />
      ) : deliveries.length ? (
        <ul className="admin-media-list" aria-label={listLabel} aria-labelledby={titleId}>
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
                    {formatDateTime(delivery.created_at)}
                  </time>
                  {showUploaderEmail && delivery.uploaded_by_email
                    ? ` · ${delivery.uploaded_by_email}`
                    : ''}
                </p>
                {delivery.notes ? (
                  <p className="admin-project-deliveries__notes">{delivery.notes}</p>
                ) : null}
                <div className="admin-media-item__actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onDownload(delivery)}
                  >
                    Download
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-page__subtitle" role="status">
          {emptyMessage}
        </p>
      )}
      {footer}
    </>
  )
}
