import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  deactivateAdminPluginCategory,
  getAdminPluginCategory,
  updateAdminPluginCategory,
} from '../../api/pluginsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage, isHttpNotFound } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type { PluginCategoryUpdatePayload } from '../../types/plugin'
import { NotFoundPage } from '../NotFound/NotFoundPage'

export function AdminPluginCategoryDetailPage() {
  const { categoryId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [hydratedCategoryId, setHydratedCategoryId] = useState<string | null>(null)
  const [form, setForm] = useState<PluginCategoryUpdatePayload>({})
  const [formError, setFormError] = useState<string | null>(null)
  const categoryQuery = useQuery({
    queryKey: ['admin', 'plugin-categories', categoryId],
    queryFn: () => getAdminPluginCategory(categoryId),
    enabled: Boolean(categoryId),
  })

  useEffect(() => {
    setHydratedCategoryId(null)
    setForm({})
    setFormError(null)
  }, [categoryId])

  useEffect(() => {
    const category = categoryQuery.data
    if (!category || category.id !== categoryId || hydratedCategoryId === category.id) {
      return
    }
    setHydratedCategoryId(category.id)
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description,
      image: category.image,
      is_active: category.is_active,
    })
  }, [categoryId, categoryQuery.data, hydratedCategoryId])

  const invalidateCategories = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['admin', 'plugin-categories'],
      refetchType: 'none',
    })
  }
  const saveMutation = useMutation({
    mutationFn: (payload: PluginCategoryUpdatePayload) =>
      updateAdminPluginCategory(categoryId, payload),
    onSuccess: async () => {
      toast.success('Plugin category updated')
      await invalidateCategories()
      navigate('/console', { replace: true })
    },
    onError: (error) =>
      setFormError(getApiErrorMessage(error, 'Could not update plugin category.')),
  })
  const deactivateMutation = useMutation({
    mutationFn: () => deactivateAdminPluginCategory(categoryId),
    onSuccess: async () => {
      toast.success('Plugin category deactivated')
      await invalidateCategories()
      navigate('/console', { replace: true })
    },
    onError: (error) =>
      setFormError(getApiErrorMessage(error, 'Could not deactivate plugin category.')),
  })
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (hydratedCategoryId !== categoryId || categoryQuery.data?.id !== categoryId) {
      setFormError('Category data is still loading. Try again in a moment.')
      return
    }
    const error =
      (form.name ?? '').trim().length < 2 ? 'Name must be at least 2 characters.' : null
    setFormError(error)
    if (error) return
    const payload: PluginCategoryUpdatePayload = {
      ...form,
      name: form.name?.trim(),
    }
    if (payload.name !== categoryQuery.data.name) {
      payload.slug = undefined
    }
    saveMutation.mutate(payload)
  }

  const category = categoryQuery.data
  const formReady = hydratedCategoryId === categoryId && category?.id === categoryId

  if (!categoryId || isHttpNotFound(categoryQuery.error)) {
    return <NotFoundPage />
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-card" aria-labelledby="plugin-category-detail-title">
        <p className="admin-page__eyebrow">Administrator</p>
        <h1 id="plugin-category-detail-title">Manage plugin category</h1>
        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/console/plugin-categories">
            Back to plugin categories
          </Link>
        </div>
        {categoryQuery.isLoading ? <Spinner label="Loading plugin category..." /> :
          categoryQuery.isError ? (
            <ErrorState
              title="Could not load plugin category"
              description={getApiErrorMessage(
                categoryQuery.error,
                'This plugin category could not be loaded.',
              )}
              action={<Button variant="secondary" onClick={() => categoryQuery.refetch()}>Retry</Button>}
            />
          ) : formReady ? (
            <form className="admin-create-form" onSubmit={onSubmit} noValidate>
              {formError ? <Alert variant="error" message={formError} /> : null}
              <FormField id="detail-plugin-category-name" label="Name">
                <Input id="detail-plugin-category-name" maxLength={255} value={form.name ?? ''} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </FormField>
              <FormField id="detail-plugin-category-slug" label="Slug">
                <Input id="detail-plugin-category-slug" value={form.slug ?? ''} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} />
              </FormField>
              <FormField id="detail-plugin-category-description" label="Description">
                <Input id="detail-plugin-category-description" value={form.description ?? ''} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
              </FormField>
              <FormField id="detail-plugin-category-image" label="Image URL">
                <Input id="detail-plugin-category-image" type="url" value={form.image ?? ''} onChange={(event) => setForm((current) => ({ ...current, image: event.target.value }))} />
              </FormField>
              <FormField id="detail-plugin-category-status" label="Status">
                <select
                  id="detail-plugin-category-status"
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
                <Button type="submit" isLoading={saveMutation.isPending}>Save changes</Button>
                <Button type="button" variant="secondary" isLoading={deactivateMutation.isPending} onClick={() => deactivateMutation.mutate()}>Deactivate</Button>
              </div>
            </form>
          ) : categoryQuery.isFetching ? (
            <Spinner label="Loading plugin category..." />
          ) : null}
      </section>
    </main>
  )
}
