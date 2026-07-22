import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'

import { listAdminUsers } from '../../api/authApi'
import {
  downloadAdminCustomProjectFile,
  getAdminCustomProject,
  updateAdminCustomProject,
  upsertAdminCustomProjectQuotation,
} from '../../api/customProjectsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type {
  AdminCustomProjectUpdatePayload,
  CustomProjectPaymentStatus,
  CustomProjectStatus,
  ProjectQuotationUpsertPayload,
} from '../../types/customProject'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AdminProjectDetailPage() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const [hydratedProjectId, setHydratedProjectId] = useState<string | null>(null)
  const [form, setForm] = useState<AdminCustomProjectUpdatePayload>({})
  const [quoteForm, setQuoteForm] = useState<ProjectQuotationUpsertPayload>({
    amount: '',
    currency: 'USD',
    estimated_delivery: '',
    notes: '',
    status: 'pending',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  const projectQuery = useQuery({
    queryKey: ['admin', 'custom-projects', projectId],
    queryFn: () => getAdminCustomProject(projectId),
    enabled: Boolean(projectId),
  })
  const designersQuery = useQuery({
    queryKey: ['admin', 'users', 'administrators-options'],
    queryFn: () =>
      listAdminUsers({ role: 'Administrator', page_size: 100, is_active: true }),
  })

  useEffect(() => {
    setHydratedProjectId(null)
    setForm({})
    setFormError(null)
    setQuoteError(null)
  }, [projectId])

  useEffect(() => {
    const project = projectQuery.data
    if (!project || project.id !== projectId || hydratedProjectId === project.id) return
    setHydratedProjectId(project.id)
    setForm({
      title: project.title,
      description: project.description,
      category: project.category,
      estimated_budget: project.estimated_budget,
      currency: project.currency,
      deadline: project.deadline,
      status: project.status,
      assigned_designer_id: project.assigned_designer?.id ?? null,
      payment_status: project.payment_status,
      admin_notes: project.admin_notes,
    })
    if (project.quotation) {
      setQuoteForm({
        amount: project.quotation.amount,
        currency: project.quotation.currency,
        estimated_delivery: project.quotation.estimated_delivery ?? '',
        notes: project.quotation.notes,
        status: project.quotation.status,
      })
    } else {
      setQuoteForm({
        amount: '',
        currency: project.currency || 'USD',
        estimated_delivery: '',
        notes: '',
        status: 'pending',
      })
    }
  }, [projectId, projectQuery.data, hydratedProjectId])

  const invalidateProjects = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['admin', 'custom-projects'],
      refetchType: 'none',
    })
    await queryClient.invalidateQueries({
      queryKey: ['admin', 'custom-projects', projectId],
      exact: true,
    })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: AdminCustomProjectUpdatePayload) =>
      updateAdminCustomProject(projectId, payload),
    onSuccess: async () => {
      toast.success('Custom project updated')
      setFormError(null)
      await invalidateProjects()
    },
    onError: (error) => {
      const message = getApiErrorMessage(error, 'Could not update custom project.')
      setFormError(message)
      toast.error(message)
    },
  })
  const quoteMutation = useMutation({
    mutationFn: (payload: ProjectQuotationUpsertPayload) =>
      upsertAdminCustomProjectQuotation(projectId, payload),
    onSuccess: async () => {
      toast.success('Quotation saved')
      setQuoteError(null)
      setHydratedProjectId(null)
      await invalidateProjects()
    },
    onError: (error) => {
      const message = getApiErrorMessage(error, 'Could not save quotation.')
      setQuoteError(message)
      toast.error(message)
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (hydratedProjectId !== projectId || projectQuery.data?.id !== projectId) {
      setFormError('Project data is still loading. Try again in a moment.')
      return
    }
    if ((form.title ?? '').trim().length < 3) {
      setFormError('Title must be at least 3 characters.')
      return
    }
    if ((form.description ?? '').trim().length < 10) {
      setFormError('Description must be at least 10 characters.')
      return
    }
    setFormError(null)
    saveMutation.mutate({
      ...form,
      title: form.title?.trim(),
      description: form.description?.trim(),
      category: form.category?.trim() ?? '',
      estimated_budget:
        form.estimated_budget === '' || form.estimated_budget == null
          ? null
          : Number(form.estimated_budget).toFixed(2),
      deadline: form.deadline || null,
      assigned_designer_id: form.assigned_designer_id || null,
    })
  }

  const onQuoteSubmit = (event: FormEvent) => {
    event.preventDefault()
    const amount = Number(quoteForm.amount)
    if (!Number.isFinite(amount) || amount < 0 || quoteForm.amount.trim() === '') {
      setQuoteError('Enter a valid non-negative quotation amount.')
      return
    }
    setQuoteError(null)
    quoteMutation.mutate({
      amount: amount.toFixed(2),
      currency: (quoteForm.currency || 'USD').trim().toUpperCase(),
      estimated_delivery: quoteForm.estimated_delivery || null,
      notes: quoteForm.notes?.trim() ?? '',
      status: quoteForm.status ?? 'pending',
    })
  }

  const project = projectQuery.data
  const formReady = hydratedProjectId === projectId && project?.id === projectId
  const designers = designersQuery.data?.results ?? []

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="project-detail-title"
      >
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="project-detail-title">Manage custom project</h1>
        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/admin/projects">
            Back to projects
          </Link>
        </div>

        {projectQuery.isLoading ? (
          <Spinner label="Loading custom project..." />
        ) : projectQuery.isError ? (
          <ErrorState
            title="Could not load custom project"
            description={getApiErrorMessage(
              projectQuery.error,
              'This custom project could not be loaded.',
            )}
            action={
              <Button variant="secondary" onClick={() => projectQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : project && formReady ? (
          <>
            <p className="home-page__subtitle">
              Customer: {project.customer.full_name} ({project.customer.email})
            </p>
            <form className="admin-create-form" onSubmit={onSubmit} noValidate>
              {formError ? <Alert variant="error" message={formError} /> : null}
              <FormField id="detail-project-title" label="Title">
                <Input
                  id="detail-project-title"
                  value={form.title ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </FormField>
              <FormField id="detail-project-description" label="Description">
                <Input
                  id="detail-project-description"
                  value={form.description ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField id="detail-project-category" label="Category">
                <Input
                  id="detail-project-category"
                  value={form.category ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, category: event.target.value }))
                  }
                />
              </FormField>
              <FormField id="detail-project-budget" label="Estimated budget">
                <Input
                  id="detail-project-budget"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.estimated_budget ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      estimated_budget: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField id="detail-project-deadline" label="Deadline">
                <Input
                  id="detail-project-deadline"
                  type="date"
                  value={form.deadline ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, deadline: event.target.value }))
                  }
                />
              </FormField>
              <FormField id="detail-project-status" label="Status">
                <select
                  id="detail-project-status"
                  className="ui-input"
                  value={form.status ?? 'submitted'}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as CustomProjectStatus,
                    }))
                  }
                >
                  <option value="submitted">Submitted</option>
                  <option value="under_review">Under review</option>
                  <option value="quoted">Quoted</option>
                  <option value="approved">Approved</option>
                  <option value="in_progress">In progress</option>
                  <option value="delivered">Delivered</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </FormField>
              <FormField id="detail-project-payment" label="Payment status">
                <select
                  id="detail-project-payment"
                  className="ui-input"
                  value={form.payment_status ?? 'unpaid'}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      payment_status: event.target.value as CustomProjectPaymentStatus,
                    }))
                  }
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="refunded">Refunded</option>
                </select>
              </FormField>
              <FormField id="detail-project-designer" label="Assigned designer">
                <select
                  id="detail-project-designer"
                  className="ui-input"
                  value={form.assigned_designer_id ?? ''}
                  disabled={designersQuery.isLoading || designersQuery.isError}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      assigned_designer_id: event.target.value || null,
                    }))
                  }
                >
                  <option value="">Unassigned</option>
                  {designers.map((designer) => (
                    <option key={designer.id} value={designer.id}>
                      {designer.full_name} ({designer.email})
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField id="detail-project-notes" label="Admin notes">
                <Input
                  id="detail-project-notes"
                  value={form.admin_notes ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      admin_notes: event.target.value,
                    }))
                  }
                />
              </FormField>
              <Button type="submit" isLoading={saveMutation.isPending}>
                Save changes
              </Button>
            </form>

            <section className="admin-media-section" aria-labelledby="project-quote-title">
              <h2 id="project-quote-title">Quotation</h2>
              <form className="admin-create-form" onSubmit={onQuoteSubmit} noValidate>
                {quoteError ? <Alert variant="error" message={quoteError} /> : null}
                <FormField id="quote-amount" label="Amount">
                  <Input
                    id="quote-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={quoteForm.amount}
                    onChange={(event) =>
                      setQuoteForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField id="quote-currency" label="Currency">
                  <Input
                    id="quote-currency"
                    maxLength={3}
                    value={quoteForm.currency ?? 'USD'}
                    onChange={(event) =>
                      setQuoteForm((current) => ({
                        ...current,
                        currency: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                </FormField>
                <FormField id="quote-delivery" label="Estimated delivery">
                  <Input
                    id="quote-delivery"
                    type="date"
                    value={quoteForm.estimated_delivery ?? ''}
                    onChange={(event) =>
                      setQuoteForm((current) => ({
                        ...current,
                        estimated_delivery: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField id="quote-notes" label="Notes">
                  <Input
                    id="quote-notes"
                    value={quoteForm.notes ?? ''}
                    onChange={(event) =>
                      setQuoteForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <Button type="submit" isLoading={quoteMutation.isPending}>
                  Save quotation
                </Button>
              </form>
            </section>

            <section className="admin-media-section" aria-labelledby="project-files-title">
              <h2 id="project-files-title">Reference files</h2>
              {project.files.length ? (
                <ul className="admin-media-list">
                  {project.files.map((file) => (
                    <li key={file.id} className="admin-media-item admin-media-item--file">
                      <span className="admin-format-badge admin-format-badge--large">
                        {file.file_type}
                      </span>
                      <div className="admin-media-item__content">
                        <p className="admin-media-item__title">{file.file_name}</p>
                        <p className="admin-media-item__meta">
                          {formatFileSize(file.file_size)}
                          {file.uploaded_by_email ? ` · ${file.uploaded_by_email}` : ''}
                        </p>
                        {file.download_url ? (
                          <div className="admin-media-item__actions">
                            <button
                              type="button"
                              className="auth-link"
                              onClick={() => {
                                void downloadAdminCustomProjectFile(
                                  projectId,
                                  file.id,
                                  file.file_name,
                                ).catch(() => {
                                  toast.error('Unable to download file.')
                                })
                              }}
                            >
                              Download
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="home-page__subtitle">No reference files uploaded yet.</p>
              )}
            </section>
          </>
        ) : projectQuery.isFetching ? (
          <Spinner label="Loading custom project..." />
        ) : null}
      </section>
    </main>
  )
}
