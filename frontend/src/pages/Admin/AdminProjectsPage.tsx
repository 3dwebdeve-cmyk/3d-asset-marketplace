import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { listAdminUsers } from '../../api/authApi'
import {
  createAdminCustomProject,
  listAdminCustomProjects,
} from '../../api/customProjectsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type {
  AdminCustomProjectCreatePayload,
  CustomProjectOrdering,
  CustomProjectPaymentStatus,
  CustomProjectStatus,
} from '../../types/customProject'

const emptyCreateForm: AdminCustomProjectCreatePayload = {
  customer_id: '',
  title: '',
  description: '',
  category: '',
  estimated_budget: '',
  currency: 'USD',
  deadline: '',
}

function validateCreate(form: AdminCustomProjectCreatePayload): string | null {
  if (!form.customer_id) return 'Select a customer.'
  if (form.title.trim().length < 3) return 'Title must be at least 3 characters.'
  if (form.description.trim().length < 10) {
    return 'Description must be at least 10 characters.'
  }
  if (form.estimated_budget) {
    const budget = Number(form.estimated_budget)
    if (!Number.isFinite(budget) || budget < 0) {
      return 'Enter a valid non-negative budget.'
    }
  }
  return null
}

export function AdminProjectsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [ordering, setOrdering] = useState<CustomProjectOrdering>('-created_at')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<AdminCustomProjectCreatePayload>(emptyCreateForm)
  const [createError, setCreateError] = useState<string | null>(null)
  const debouncedSearch = useDebouncedValue(search)

  const projectsQuery = useQuery({
    queryKey: [
      'admin',
      'custom-projects',
      { search: debouncedSearch, status, paymentStatus, ordering, page },
    ],
    queryFn: () =>
      listAdminCustomProjects({
        search: debouncedSearch || undefined,
        status: (status || undefined) as CustomProjectStatus | undefined,
        payment_status: (paymentStatus || undefined) as
          | CustomProjectPaymentStatus
          | undefined,
        ordering,
        page,
        page_size: 20,
      }),
  })
  const customersQuery = useQuery({
    queryKey: ['admin', 'users', 'customers-options'],
    queryFn: () => listAdminUsers({ role: 'Customer', page_size: 100, is_active: true }),
    enabled: showCreate,
  })
  const createMutation = useMutation({
    mutationFn: createAdminCustomProject,
    onSuccess: async (project) => {
      toast.success('Custom project created')
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'custom-projects'],
        refetchType: 'none',
      })
      navigate(`/admin/projects/${project.id}`, { replace: true })
    },
    onError: (error) =>
      setCreateError(getApiErrorMessage(error, 'Could not create custom project.')),
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateCreate(createForm)
    setCreateError(validationError)
    if (validationError) return
    createMutation.mutate({
      ...createForm,
      title: createForm.title.trim(),
      description: createForm.description.trim(),
      category: createForm.category?.trim() || '',
      estimated_budget: createForm.estimated_budget
        ? Number(createForm.estimated_budget).toFixed(2)
        : null,
      deadline: createForm.deadline || null,
    })
  }
  const resetPage = () => setPage(1)
  const customers = customersQuery.data?.results ?? []

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="projects-title">
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="projects-title">Custom projects</h1>
        <p className="home-page__subtitle">
          Review customer requests, set quotations, and track delivery status.
        </p>
        <div className="dashboard-card__actions">
          <Button type="button" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? 'Hide create form' : 'Create project for customer'}
          </Button>
        </div>

        {showCreate ? (
          <form className="admin-create-form" onSubmit={onSubmit} noValidate>
            {createError ? <Alert variant="error" message={createError} /> : null}
            <FormField id="project-customer" label="Customer">
              <select
                id="project-customer"
                className="ui-input"
                value={createForm.customer_id}
                disabled={customersQuery.isLoading || customersQuery.isError}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    customer_id: event.target.value,
                  }))
                }
              >
                <option value="">
                  {customersQuery.isLoading ? 'Loading customers...' : 'Select a customer'}
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.full_name} ({customer.email})
                  </option>
                ))}
              </select>
            </FormField>
            {customersQuery.isError ? (
              <Alert variant="error" message="Customers could not be loaded." />
            ) : null}
            <FormField id="project-title" label="Title">
              <Input
                id="project-title"
                value={createForm.title}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </FormField>
            <FormField id="project-description" label="Description">
              <Input
                id="project-description"
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="project-category" label="Category">
              <Input
                id="project-category"
                value={createForm.category ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="project-budget" label="Estimated budget">
              <Input
                id="project-budget"
                type="number"
                min="0"
                step="0.01"
                value={createForm.estimated_budget ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    estimated_budget: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="project-deadline" label="Deadline">
              <Input
                id="project-deadline"
                type="date"
                value={createForm.deadline ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    deadline: event.target.value,
                  }))
                }
              />
            </FormField>
            <Button type="submit" isLoading={createMutation.isPending}>
              Create project
            </Button>
          </form>
        ) : null}

        <div className="admin-filters">
          <Input
            aria-label="Search custom projects"
            placeholder="Search title, description, category, or customer"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              resetPage()
            }}
          />
          <select
            className="ui-input"
            aria-label="Filter by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              resetPage()
            }}
          >
            <option value="">All statuses</option>
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
          <select
            className="ui-input"
            aria-label="Filter by payment status"
            value={paymentStatus}
            onChange={(event) => {
              setPaymentStatus(event.target.value)
              resetPage()
            }}
          >
            <option value="">All payment statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="refunded">Refunded</option>
          </select>
          <select
            className="ui-input"
            aria-label="Order custom projects"
            value={ordering}
            onChange={(event) => {
              setOrdering(event.target.value as CustomProjectOrdering)
              resetPage()
            }}
          >
            <option value="-created_at">Newest first</option>
            <option value="created_at">Oldest first</option>
            <option value="title">Title A–Z</option>
            <option value="-title">Title Z–A</option>
            <option value="deadline">Deadline soonest</option>
            <option value="-deadline">Deadline latest</option>
          </select>
        </div>

        {projectsQuery.isLoading ? (
          <Spinner label="Loading custom projects..." />
        ) : projectsQuery.isError ? (
          <ErrorState
            title="Could not load custom projects"
            description="Administrator project list could not be loaded."
            action={
              <Button variant="secondary" onClick={() => projectsQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Quote</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projectsQuery.data?.results.map((project) => (
                    <tr
                      key={project.id}
                      className={
                        project.has_unread
                          ? 'admin-table__row--has-unread'
                          : undefined
                      }
                    >
                      <td>
                        <div className="project-list-title">
                          <span>{project.title}</span>
                          {project.has_unread ? (
                            <span
                              className="project-unread-badge"
                              aria-label={`${project.unread_count} unread message${project.unread_count === 1 ? '' : 's'}`}
                            >
                              {project.unread_count > 99
                                ? '99+'
                                : project.unread_count}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>{project.customer.full_name}</td>
                      <td>{project.status}</td>
                      <td>{project.payment_status}</td>
                      <td>
                        {project.quotation_amount
                          ? `${project.currency} ${project.quotation_amount}`
                          : '—'}
                      </td>
                      <td>
                        <Link className="auth-link" to={`/admin/projects/${project.id}`}>
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {projectsQuery.data?.results.length === 0 ? (
                <p className="home-page__subtitle">No custom projects match your filters.</p>
              ) : null}
            </div>
            <div className="dashboard-card__actions" aria-label="Custom project pagination">
              <Button
                type="button"
                variant="secondary"
                disabled={!projectsQuery.data?.previous}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                type="button"
                variant="secondary"
                disabled={!projectsQuery.data?.next}
                onClick={() => setPage((value) => value + 1)}
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
