import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  archiveAdminPlugin,
  getAdminPlugin,
  listAllAdminPluginCategories,
  updateAdminPlugin,
} from '../../api/pluginsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type {
  AdminPluginUpdatePayload,
  PluginLicenseType,
  PluginStatus,
} from '../../types/plugin'
import { PluginMediaSection } from './PluginMediaSection'

function validatePlugin(form: AdminPluginUpdatePayload): string | null {
  if (!form.category_id) return 'Select a plugin category.'
  if ((form.name ?? '').trim().length < 2) return 'Name must be at least 2 characters.'
  const price = Number(form.price)
  if (form.price === '' || !Number.isFinite(price) || price < 0) {
    return 'Enter a valid non-negative price.'
  }
  if (!(form.version ?? '').trim()) return 'Version is required.'
  if (form.discount_price !== null && form.discount_price !== '') {
    const discountPrice = Number(form.discount_price)
    if (!Number.isFinite(discountPrice) || discountPrice < 0) {
      return 'Enter a valid non-negative discount price.'
    }
    if (discountPrice > price) return 'Discount price cannot exceed price.'
  }
  return null
}

export function AdminPluginDetailPage() {
  const { pluginId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [hydratedPluginId, setHydratedPluginId] = useState<string | null>(null)
  const [form, setForm] = useState<AdminPluginUpdatePayload>({})
  const [formError, setFormError] = useState<string | null>(null)

  const pluginQuery = useQuery({
    queryKey: ['admin', 'plugins', pluginId],
    queryFn: () => getAdminPlugin(pluginId),
    enabled: Boolean(pluginId),
  })
  const categoriesQuery = useQuery({
    queryKey: ['admin', 'plugin-categories', 'options'],
    queryFn: () => listAllAdminPluginCategories(),
  })

  useEffect(() => {
    setHydratedPluginId(null)
    setForm({})
    setFormError(null)
  }, [pluginId])

  useEffect(() => {
    const plugin = pluginQuery.data
    if (!plugin || plugin.id !== pluginId || hydratedPluginId === plugin.id) return
    setHydratedPluginId(plugin.id)
    setForm({
      category_id: plugin.category.id,
      name: plugin.name,
      slug: plugin.slug,
      description: plugin.description,
      short_description: plugin.short_description,
      price: plugin.price,
      currency: plugin.currency,
      discount_price: plugin.discount_price,
      version: plugin.version,
      compatibility: plugin.compatibility,
      documentation_url: plugin.documentation_url,
      license_type: plugin.license_type,
      status: plugin.status,
    })
  }, [pluginId, pluginQuery.data, hydratedPluginId])

  const invalidatePlugin = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['admin', 'plugins'],
      refetchType: 'none',
    })
  }
  const saveMutation = useMutation({
    mutationFn: (payload: AdminPluginUpdatePayload) => updateAdminPlugin(pluginId, payload),
    onSuccess: async () => {
      toast.success('Plugin updated')
      await invalidatePlugin()
      navigate('/admin', { replace: true })
    },
    onError: (error) => setFormError(getApiErrorMessage(error, 'Could not update plugin.')),
  })
  const archiveMutation = useMutation({
    mutationFn: () => archiveAdminPlugin(pluginId),
    onSuccess: async () => {
      toast.success('Plugin archived')
      await invalidatePlugin()
      navigate('/admin', { replace: true })
    },
    onError: (error) => setFormError(getApiErrorMessage(error, 'Could not archive plugin.')),
  })
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (hydratedPluginId !== pluginId || pluginQuery.data?.id !== pluginId) {
      setFormError('Plugin data is still loading. Try again in a moment.')
      return
    }
    const validationError = validatePlugin(form)
    setFormError(validationError)
    if (validationError) return
    const payload: AdminPluginUpdatePayload = {
      ...form,
      name: form.name?.trim(),
      version: form.version?.trim(),
      price: Number(form.price).toFixed(2),
      discount_price:
        form.discount_price === '' ? null : form.discount_price,
    }
    if (payload.name !== pluginQuery.data.name) {
      payload.slug = undefined
    }
    if (payload.category_id === pluginQuery.data.category.id) {
      payload.category_id = undefined
    }
    saveMutation.mutate(payload)
  }
  const plugin = pluginQuery.data
  const formReady = hydratedPluginId === pluginId && plugin?.id === pluginId
  const categories = categoriesQuery.data ?? []

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="plugin-detail-title">
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="plugin-detail-title">Manage plugin</h1>
        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/admin/plugins">
            Back to plugins
          </Link>
        </div>

        {pluginQuery.isLoading ? <Spinner label="Loading plugin..." /> : pluginQuery.isError ? (
          <ErrorState
            title="Could not load plugin"
            description={getApiErrorMessage(
              pluginQuery.error,
              'This plugin could not be loaded.',
            )}
            action={<Button variant="secondary" onClick={() => pluginQuery.refetch()}>Retry</Button>}
          />
        ) : plugin && formReady ? (
          <>
            <form className="admin-create-form" onSubmit={onSubmit} noValidate>
              {formError ? <Alert variant="error" message={formError} /> : null}
              <FormField id="detail-plugin-category" label="Category">
                <select
                  id="detail-plugin-category"
                  className="ui-input"
                  value={form.category_id ?? ''}
                  disabled={categoriesQuery.isLoading || categoriesQuery.isError}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, category_id: event.target.value }))
                  }
                >
                  {categories.map((category) => (
                    <option
                      key={category.id}
                      value={category.id}
                      disabled={!category.is_active && category.id !== plugin.category.id}
                    >
                      {category.name}{category.is_active ? '' : ' (Inactive)'}
                    </option>
                  ))}
                </select>
              </FormField>
              {categoriesQuery.isError ? (
                <Alert variant="error" message="Plugin categories could not be loaded." />
              ) : null}
              <FormField id="detail-plugin-name" label="Name">
                <Input id="detail-plugin-name" value={form.name ?? ''} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </FormField>
              <FormField id="detail-plugin-slug" label="Slug">
                <Input id="detail-plugin-slug" value={form.slug ?? ''} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} />
              </FormField>
              <FormField id="detail-plugin-summary" label="Short description">
                <Input id="detail-plugin-summary" maxLength={500} value={form.short_description ?? ''} onChange={(event) => setForm((current) => ({ ...current, short_description: event.target.value }))} />
              </FormField>
              <FormField id="detail-plugin-description" label="Description">
                <Input id="detail-plugin-description" value={form.description ?? ''} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
              </FormField>
              <FormField id="detail-plugin-price" label="Price">
                <Input id="detail-plugin-price" type="number" min="0" step="0.01" value={form.price ?? ''} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} />
              </FormField>
              <FormField id="detail-plugin-discount" label="Discount price">
                <Input id="detail-plugin-discount" type="number" min="0" step="0.01" value={form.discount_price ?? ''} onChange={(event) => setForm((current) => ({ ...current, discount_price: event.target.value || null }))} />
              </FormField>
              <FormField id="detail-plugin-currency" label="Currency">
                <Input id="detail-plugin-currency" maxLength={3} value={form.currency ?? 'USD'} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
              </FormField>
              <FormField id="detail-plugin-version" label="Version">
                <Input id="detail-plugin-version" maxLength={64} value={form.version ?? ''} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} />
              </FormField>
              <FormField id="detail-plugin-compatibility" label="Compatibility">
                <Input id="detail-plugin-compatibility" maxLength={255} value={form.compatibility ?? ''} onChange={(event) => setForm((current) => ({ ...current, compatibility: event.target.value }))} />
              </FormField>
              <FormField id="detail-plugin-docs" label="Documentation URL">
                <Input id="detail-plugin-docs" type="url" value={form.documentation_url ?? ''} onChange={(event) => setForm((current) => ({ ...current, documentation_url: event.target.value }))} />
              </FormField>
              <FormField id="detail-plugin-license" label="License type">
                <select id="detail-plugin-license" className="ui-input" value={form.license_type ?? 'standard'} onChange={(event) => setForm((current) => ({ ...current, license_type: event.target.value as PluginLicenseType }))}>
                  <option value="standard">Standard</option><option value="extended">Extended</option><option value="commercial">Commercial</option>
                </select>
              </FormField>
              <FormField id="detail-plugin-status" label="Status">
                <select id="detail-plugin-status" className="ui-input" value={form.status ?? 'draft'} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PluginStatus }))}>
                  <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
                </select>
              </FormField>
              <div className="dashboard-card__actions">
                <Button type="submit" isLoading={saveMutation.isPending}>Save changes</Button>
                <Button type="button" variant="secondary" isLoading={archiveMutation.isPending} onClick={() => archiveMutation.mutate()}>Archive</Button>
              </div>
            </form>
            <PluginMediaSection key={pluginId} pluginId={pluginId} plugin={plugin} />
          </>
        ) : pluginQuery.isFetching ? (
          <Spinner label="Loading plugin..." />
        ) : null}
      </section>
    </main>
  )
}
