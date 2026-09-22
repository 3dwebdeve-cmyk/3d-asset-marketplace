import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  deactivateAdminCategory,
  getAdminCategory,
  listAdminCategories,
  updateAdminCategory,
} from '../../api/categoriesApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage, isHttpNotFound } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type { AdminCategoryUpdatePayload } from '../../types/category'
import { NotFoundPage } from '../NotFound/NotFoundPage'

export function AdminCategoryDetailPage() {
  const { categoryId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AdminCategoryUpdatePayload>({})
  const [formError, setFormError] = useState<string | null>(null)

  const categoryQuery = useQuery({
    queryKey: ['admin', 'categories', categoryId],
    queryFn: () => getAdminCategory(categoryId),
    enabled: Boolean(categoryId),
  })

  const parentOptionsQuery = useQuery({
    queryKey: ['admin', 'categories', 'parent-options'],
    queryFn: () => listAdminCategories({ is_active: true, page_size: 100 }),
  })

  useEffect(() => {
    if (!categoryQuery.data) {
      return
    }
    setForm({
      name: categoryQuery.data.name,
      slug: categoryQuery.data.slug,
      description: categoryQuery.data.description,
      image: categoryQuery.data.image,
      parent_id: categoryQuery.data.parent?.id ?? null,
      is_active: categoryQuery.data.is_active,
    })
  }, [categoryQuery.data])

  const saveMutation = useMutation({
    mutationFn: (payload: AdminCategoryUpdatePayload) =>
      updateAdminCategory(categoryId, payload),
    onSuccess: async () => {
      toast.success('Category updated')
      setFormError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
      navigate('/console', { replace: true })
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not update category.'))
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateAdminCategory(categoryId),
    onSuccess: async () => {
      toast.success('Category deactivated')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
      navigate('/console', { replace: true })
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not deactivate category.'))
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    saveMutation.mutate(form)
  }

  const parentOptions =
    parentOptionsQuery.data?.results.filter(
      (category) => category.id !== categoryId,
    ) ?? []

  if (!categoryId || isHttpNotFound(categoryQuery.error)) {
    return <NotFoundPage />
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-card" aria-labelledby="admin-category-detail-title">
        <p className="admin-page__eyebrow">Administrator</p>
        <h1 id="admin-category-detail-title">Manage category</h1>

        <div className="dashboard-card__actions">
          <Link
            className="home-page__cta home-page__cta--secondary"
            to="/console/categories"
          >
            Back to categories
          </Link>
        </div>

        {categoryQuery.isLoading ? (
          <Spinner label="Loading category..." />
        ) : categoryQuery.isError ? (
          <ErrorState
            title="Category not found"
            description="This category could not be loaded."
            action={
              <Button variant="secondary" onClick={() => categoryQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : (
          <form className="admin-create-form" onSubmit={onSubmit} noValidate>
            {formError ? <Alert variant="error" message={formError} /> : null}
            <FormField id="detail-name" label="Name">
              <Input
                id="detail-name"
                value={form.name ?? ''}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </FormField>
            <FormField id="detail-slug" label="Slug">
              <Input
                id="detail-slug"
                value={form.slug ?? ''}
                onChange={(event) =>
                  setForm((current) => ({ ...current, slug: event.target.value }))
                }
              />
            </FormField>
            <FormField id="detail-description" label="Description">
              <Input
                id="detail-description"
                value={form.description ?? ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="detail-image" label="Image URL">
              <Input
                id="detail-image"
                type="text"
                inputMode="url"
                placeholder="https://example.com/category.jpg"
                value={form.image ?? ''}
                onChange={(event) =>
                  setForm((current) => ({ ...current, image: event.target.value }))
                }
              />
            </FormField>
            <FormField id="detail-parent" label="Parent category">
              <select
                id="detail-parent"
                className="ui-input"
                value={form.parent_id ?? ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    parent_id: event.target.value || null,
                  }))
                }
              >
                <option value="">No parent (top level)</option>
                {parentOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="detail-active" label="Status">
              <select
                id="detail-active"
                className="ui-input"
                value={form.is_active ? 'active' : 'inactive'}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    is_active: event.target.value === 'active',
                  }))
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FormField>
            <div className="dashboard-card__actions">
              <Button type="submit" isLoading={saveMutation.isPending}>
                Save changes
              </Button>
              <Button
                type="button"
                variant="secondary"
                isLoading={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate()}
              >
                Deactivate
              </Button>
            </div>
          </form>
        )}
      </section>
    </main>
  )
}
