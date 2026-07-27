import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { createCustomerCustomProject } from '../../api/customProjectsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type { CustomerCustomProjectCreatePayload } from '../../types/customProject'

const emptyForm: CustomerCustomProjectCreatePayload = {
  title: '',
  description: '',
  category: '',
  estimated_budget: '',
  currency: 'USD',
  deadline: '',
}

function validateForm(form: CustomerCustomProjectCreatePayload): string | null {
  if (form.title.trim().length < 3) {
    return 'Title must be at least 3 characters.'
  }
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

export function CustomerProjectRequestPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CustomerCustomProjectCreatePayload>(emptyForm)
  const [validationError, setValidationError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: createCustomerCustomProject,
    onSuccess: async (project) => {
      toast.success('Project request submitted')
      await queryClient.invalidateQueries({
        queryKey: ['customer', 'custom-projects'],
        refetchType: 'none',
      })
      navigate(`/dashboard/projects/${project.id}`, { replace: true })
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const error = validateForm(form)
    setValidationError(error)
    if (error) return

    createMutation.mutate({
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category?.trim() || '',
      currency: form.currency?.trim() || 'USD',
      estimated_budget: form.estimated_budget
        ? Number(form.estimated_budget).toFixed(2)
        : null,
      deadline: form.deadline || null,
    })
  }

  const serverError = createMutation.isError
    ? getApiErrorMessage(createMutation.error, 'Could not submit your project request.')
    : null

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="new-project-title"
      >
        <p className="home-page__eyebrow">Customer Dashboard</p>
        <h1 id="new-project-title">Request a custom project</h1>
        <p className="home-page__subtitle">
          Describe what you need and our team will review your request and send a quotation.
        </p>
        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/dashboard/projects">
            Back to My projects
          </Link>
        </div>

        <form className="admin-create-form" onSubmit={onSubmit} noValidate>
          {validationError ? <Alert variant="error" message={validationError} /> : null}
          {serverError ? <Alert variant="error" message={serverError} /> : null}

          <FormField id="request-title" label="Project title">
            <Input
              id="request-title"
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="e.g. Game-ready wooden chair"
            />
          </FormField>

          <FormField id="request-description" label="Description">
            <textarea
              id="request-description"
              className="ui-input project-message-composer__input"
              rows={5}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Describe the model, style, formats, and any reference details…"
            />
          </FormField>

          <FormField id="request-category" label="Category (optional)">
            <Input
              id="request-category"
              value={form.category ?? ''}
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value }))
              }
              placeholder="e.g. Furniture, Props, Characters"
            />
          </FormField>

          <FormField id="request-budget" label="Estimated budget (optional)">
            <Input
              id="request-budget"
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

          <FormField id="request-currency" label="Currency">
            <Input
              id="request-currency"
              value={form.currency ?? 'USD'}
              maxLength={3}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  currency: event.target.value.toUpperCase(),
                }))
              }
            />
          </FormField>

          <FormField id="request-deadline" label="Deadline (optional)">
            <Input
              id="request-deadline"
              type="date"
              value={form.deadline ?? ''}
              onChange={(event) =>
                setForm((current) => ({ ...current, deadline: event.target.value }))
              }
            />
          </FormField>

          <Button type="submit" isLoading={createMutation.isPending}>
            Submit request
          </Button>
        </form>
      </section>
    </main>
  )
}
