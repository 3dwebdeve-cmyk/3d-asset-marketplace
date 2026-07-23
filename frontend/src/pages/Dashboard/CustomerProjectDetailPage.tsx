import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Link, useParams } from 'react-router-dom'

import { getCustomerCustomProject } from '../../api/customProjectsApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { formatFileSize } from '../../lib/productUpload'
import {
  CUSTOM_PROJECT_STATUS_LABELS,
  type CustomProjectPaymentStatus,
  type CustomerCustomProject,
  type ProjectFileType,
  type ProjectQuotationStatus,
} from '../../types/customProject'
import { CustomerProjectMessagesSection } from './CustomerProjectMessagesSection'

const PAYMENT_STATUS_LABELS: Record<CustomProjectPaymentStatus, string> = {
  unpaid: 'Unpaid',
  pending: 'Pending',
  paid: 'Paid',
  refunded: 'Refunded',
}

const QUOTATION_STATUS_LABELS: Record<ProjectQuotationStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
}

const FILE_TYPE_LABELS: Record<ProjectFileType, string> = {
  reference_image: 'Reference image',
  cad_drawing: 'CAD drawing',
  sketch: 'Sketch',
  other: 'Other',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatMoney(amount: string | null, currency: string): string {
  if (!amount) return '—'
  return `${currency} ${amount}`
}

function isNotFoundOrForbidden(error: unknown): boolean {
  if (!isAxiosError(error)) return false
  const status = error.response?.status
  return status === 404 || status === 403
}

function ProjectSummary({ project }: { project: CustomerCustomProject }) {
  return (
    <div className="dashboard-card__details">
      <p>
        <strong>Status:</strong> {CUSTOM_PROJECT_STATUS_LABELS[project.status]}
      </p>
      <p>
        <strong>Payment status:</strong>{' '}
        {PAYMENT_STATUS_LABELS[project.payment_status]}
      </p>
      <p>
        <strong>Category:</strong> {project.category || '—'}
      </p>
      <p>
        <strong>Budget:</strong>{' '}
        {formatMoney(project.estimated_budget, project.currency)}
      </p>
      <p>
        <strong>Deadline:</strong> {formatDate(project.deadline)}
      </p>
      <p>
        <strong>Description:</strong> {project.description}
      </p>
      {project.assigned_designer ? (
        <p>
          <strong>Assigned designer:</strong>{' '}
          {project.assigned_designer.full_name}
        </p>
      ) : null}
    </div>
  )
}

function QuotationBlock({ project }: { project: CustomerCustomProject }) {
  const quotation = project.quotation

  return (
    <section className="admin-media-section" aria-labelledby="project-quote-title">
      <h2 id="project-quote-title">Quotation</h2>
      {quotation ? (
        <div className="dashboard-card__details">
          <p>
            <strong>Amount:</strong>{' '}
            {formatMoney(quotation.amount, quotation.currency)}
          </p>
          <p>
            <strong>Status:</strong> {QUOTATION_STATUS_LABELS[quotation.status]}
          </p>
          <p>
            <strong>Estimated delivery:</strong>{' '}
            {formatDate(quotation.estimated_delivery)}
          </p>
          <p>
            <strong>Notes:</strong> {quotation.notes.trim() ? quotation.notes : '—'}
          </p>
        </div>
      ) : (
        <p className="home-page__subtitle" role="status">
          No quotation yet.
        </p>
      )}
    </section>
  )
}

function ReferenceFilesBlock({ project }: { project: CustomerCustomProject }) {
  return (
    <section className="admin-media-section" aria-labelledby="project-files-title">
      <h2 id="project-files-title">Reference files</h2>
      {project.files.length ? (
        <ul className="admin-media-list">
          {project.files.map((file) => (
            <li key={file.id} className="admin-media-item admin-media-item--file">
              <span className="admin-format-badge admin-format-badge--large">
                {FILE_TYPE_LABELS[file.file_type]}
              </span>
              <div className="admin-media-item__content">
                <p className="admin-media-item__title">{file.file_name}</p>
                <p className="admin-media-item__meta">
                  {formatFileSize(file.file_size)} · {formatDate(file.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-page__subtitle" role="status">
          No reference files uploaded yet.
        </p>
      )}
    </section>
  )
}

export function CustomerProjectDetailPage() {
  const { projectId = '' } = useParams<{ projectId: string }>()

  const projectQuery = useQuery({
    queryKey: ['customer', 'custom-projects', projectId],
    queryFn: () => getCustomerCustomProject(projectId),
    enabled: Boolean(projectId),
    // Missing/forbidden projects should not auto-retry; Retry button covers recoverable errors.
    retry: false,
  })

  const backLink = (
    <div className="dashboard-card__actions">
      <Link className="home-page__cta home-page__cta--secondary" to="/dashboard/projects">
        Back to My projects
      </Link>
    </div>
  )

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="project-detail-title"
      >
        <p className="home-page__eyebrow">Customer Dashboard</p>
        {backLink}

        {!projectId ? (
          <ErrorState
            title="Project not found"
            description="This project could not be found or you do not have access to it."
          />
        ) : projectQuery.isLoading ? (
          <>
            <h1 id="project-detail-title">Project details</h1>
            <Spinner label="Loading project..." />
          </>
        ) : projectQuery.isError ? (
          isNotFoundOrForbidden(projectQuery.error) ? (
            <ErrorState
              title="Project not found"
              description="This project could not be found or you do not have access to it."
            />
          ) : (
            <ErrorState
              title="Could not load project"
              description={getApiErrorMessage(
                projectQuery.error,
                'This project could not be loaded. Please try again.',
              )}
              action={
                <Button
                  variant="secondary"
                  isLoading={projectQuery.isFetching}
                  onClick={() => projectQuery.refetch()}
                >
                  Retry
                </Button>
              }
            />
          )
        ) : projectQuery.data ? (
          <>
            <h1 id="project-detail-title">{projectQuery.data.title}</h1>
            <ProjectSummary project={projectQuery.data} />
            <QuotationBlock project={projectQuery.data} />
            <ReferenceFilesBlock project={projectQuery.data} />
            <CustomerProjectMessagesSection projectId={projectQuery.data.id} />
          </>
        ) : null}
      </section>
    </main>
  )
}
