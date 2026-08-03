import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Link, useParams } from 'react-router-dom'

import {
  acceptCustomerCustomProjectQuotation,
  getCustomerCustomProject,
  payCustomerCustomProjectQuotation,
} from '../../api/customProjectsApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import { StatusBadge } from '../../components/ui/StatusBadge'
import {
  CUSTOM_PROJECT_STATUS_LABELS,
  type CustomProjectPaymentStatus,
  type CustomerCustomProject,
  type ProjectQuotationStatus,
} from '../../types/customProject'
import { CustomerProjectDeliveriesSection } from './CustomerProjectDeliveriesSection'
import { CustomerProjectMessagesSection } from './CustomerProjectMessagesSection'
import { CustomerProjectReferenceFilesSection } from './CustomerProjectReferenceFilesSection'

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
        <strong>Status:</strong>{' '}
        <StatusBadge
          status={project.status}
          label={CUSTOM_PROJECT_STATUS_LABELS[project.status] ?? project.status}
        />
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

function QuotationBlock({
  project,
  onAccept,
  isAccepting,
  acceptError,
  onPay,
  isPaying,
  payError,
}: {
  project: CustomerCustomProject
  onAccept: () => void
  isAccepting: boolean
  acceptError: string | null
  onPay: () => void
  isPaying: boolean
  payError: string | null
}) {
  const quotation = project.quotation
  const canAccept =
    project.status === 'quoted' && quotation?.status === 'pending'
  const terminalProject =
    project.status === 'completed' ||
    project.status === 'cancelled' ||
    project.status === 'rejected'
  const canPay =
    quotation?.status === 'accepted' &&
    !terminalProject &&
    project.payment_status !== 'paid' &&
    project.payment_status !== 'refunded'

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
          {canAccept ? (
            <div className="dashboard-card__actions">
              <Button
                type="button"
                isLoading={isAccepting}
                onClick={onAccept}
              >
                Accept quotation
              </Button>
            </div>
          ) : null}
          {canPay ? (
            <div className="dashboard-card__actions">
              <Button type="button" isLoading={isPaying} onClick={onPay}>
                {project.payment_status === 'pending'
                  ? 'Continue payment'
                  : 'Pay quotation'}
              </Button>
            </div>
          ) : null}
          {project.payment_status === 'paid' && quotation.status === 'accepted' ? (
            <p className="home-page__subtitle" role="status">
              Quotation paid. Work can proceed on this project.
            </p>
          ) : null}
          {acceptError ? (
            <p className="form-error" role="alert">
              {acceptError}
            </p>
          ) : null}
          {payError ? (
            <p className="form-error" role="alert">
              {payError}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="home-page__subtitle" role="status">
          No quotation yet.
        </p>
      )}
    </section>
  )
}

export function CustomerProjectDetailPage() {
  const { projectId = '' } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()

  const projectQuery = useQuery({
    queryKey: ['customer', 'custom-projects', projectId],
    queryFn: () => getCustomerCustomProject(projectId),
    enabled: Boolean(projectId),
    // Missing/forbidden projects should not auto-retry; Retry button covers recoverable errors.
    retry: false,
  })

  const acceptMutation = useMutation({
    mutationFn: () => acceptCustomerCustomProjectQuotation(projectId),
    onSuccess: (updated) => {
      queryClient.setQueryData(['customer', 'custom-projects', projectId], updated)
      void queryClient.invalidateQueries({
        queryKey: ['customer', 'custom-projects'],
      })
      toast.success('Quotation accepted.')
    },
  })

  const payMutation = useMutation({
    mutationFn: () => payCustomerCustomProjectQuotation(projectId),
    onSuccess: (data) => {
      window.location.href = data.checkout_url
    },
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
            {projectQuery.data.status === 'completed' ? (
              <div className="project-completed-banner" role="status">
                <strong>Project completed!</strong> Your project has been delivered and marked
                complete. Thank you for working with us.
              </div>
            ) : null}
            <ProjectSummary project={projectQuery.data} />
            <QuotationBlock
              project={projectQuery.data}
              onAccept={() => acceptMutation.mutate()}
              isAccepting={acceptMutation.isPending}
              acceptError={
                acceptMutation.isError
                  ? getApiErrorMessage(
                      acceptMutation.error,
                      'Could not accept the quotation. Please try again.',
                    )
                  : null
              }
              onPay={() => payMutation.mutate()}
              isPaying={payMutation.isPending}
              payError={
                payMutation.isError
                  ? getApiErrorMessage(
                      payMutation.error,
                      'Could not start quotation payment. Please try again.',
                    )
                  : null
              }
            />
            <CustomerProjectReferenceFilesSection project={projectQuery.data} />
            <CustomerProjectDeliveriesSection projectId={projectQuery.data.id} />
            <CustomerProjectMessagesSection projectId={projectQuery.data.id} />
          </>
        ) : null}
      </section>
    </main>
  )
}
