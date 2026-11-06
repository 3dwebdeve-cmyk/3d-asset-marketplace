import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  createAdminPlugin,
  listAllAdminPluginCategories,
  listAdminPlugins,
} from '../../api/pluginsApi'
import { AdminIcon } from '../../components/admin/AdminIcon'
import '../../styles/admin-plugins.css'
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
  AdminPluginCreatePayload,
  PluginOrdering,
  PluginStatus,
} from '../../types/plugin'

const emptyCreateForm: AdminPluginCreatePayload = {
  category_id: '',
  name: '',
  short_description: '',
  price: '',
  currency: 'USD',
  version: '1.0',
  status: 'draft',
}

function validateCreate(form: AdminPluginCreatePayload): string | null {
  if (!form.category_id) return 'Select a plugin category.'
  if (form.name.trim().length < 2) return 'Name must be at least 2 characters.'
  const price = Number(form.price)
  if (form.price.trim() === '' || !Number.isFinite(price) || price < 0) {
    return 'Enter a valid non-negative price.'
  }
  if (!form.version?.trim()) return 'Version is required.'
  return null
}

export function AdminPluginsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [ordering, setOrdering] = useState<PluginOrdering>('-created_at')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<AdminPluginCreatePayload>(emptyCreateForm)
  const [createError, setCreateError] = useState<string | null>(null)
  const debouncedSearch = useDebouncedValue(search)

  const pluginsQuery = useQuery({
    queryKey: [
      'admin',
      'plugins',
      { search: debouncedSearch, status, categoryId, ordering, page, pageSize },
    ],
    queryFn: () =>
      listAdminPlugins({
        search: debouncedSearch || undefined,
        status: (status || undefined) as PluginStatus | undefined,
        category_id: categoryId || undefined,
        ordering,
        page,
        page_size: pageSize,
      }),
  })
  const categoriesQuery = useQuery({
    queryKey: ['admin', 'plugin-categories', 'options'],
    queryFn: listAllAdminPluginCategories,
  })
  const summaryQuery = useQuery({
    queryKey: ['admin', 'plugins', 'summary'],
    queryFn: async () => {
      const [total, active, archived] = await Promise.all([
        listAdminPlugins({ page_size: 1 }),
        listAdminPlugins({ status: 'published', page_size: 1 }),
        listAdminPlugins({ status: 'archived', page_size: 1 }),
      ])
      return { total: total.count, active: active.count, archived: archived.count }
    },
  })

  const createMutation = useMutation({
    mutationFn: createAdminPlugin,
    onSuccess: async () => {
      toast.success('Plugin created')
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'plugins'],
        refetchType: 'none',
      })
      navigate('/console', { replace: true })
    },
    onError: (error) => setCreateError(getApiErrorMessage(error, 'Could not create plugin.')),
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateCreate(createForm)
    setCreateError(validationError)
    if (validationError) return
    createMutation.mutate({
      ...createForm,
      name: createForm.name.trim(),
      version: createForm.version?.trim(),
      price: Number(createForm.price).toFixed(2),
    })
  }
  const resetPage = () => setPage(1)
  const categories = categoriesQuery.data ?? []
  const activeCategories = categories.filter((category) => category.is_active)

  return (
    <main className="dashboard-page admin-plugins-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="plugins-title">
        <header className="plugins-heading">
          <svg className="plugins-heading__waves" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden="true">
            {Array.from({ length: 20 }, (_, i) => <path key={i} d={`M 0 ${180 + i * 3} C 400 ${30 + i * 5}, 650 ${340 - i * 9}, 1200 ${-180 + i * 18}`} />)}
          </svg>
          <span className="plugins-heading__icon"><AdminIcon name="puzzle" size={44} /></span>
          <div><h1 id="plugins-title">Plugins</h1><p className="home-page__subtitle">Create and manage downloadable plugin products.</p></div>
        </header>
        <div className="plugins-summary">
          {([
            ['box', summaryQuery.data?.total, 'Total plugins', 'red'],
            ['layers', categoriesQuery.data?.length, 'Categories', 'red'],
            ['check', summaryQuery.data?.active, 'Active', 'green'],
            ['archive', summaryQuery.data?.archived, 'Archived', 'red'],
          ] as const).map(([icon, count, label, tone]) => (
            <div key={label} className={`plugins-stat plugins-stat--${tone}`}>
              <span className="plugins-stat__icon"><AdminIcon name={icon} size={34} /></span>
              <div><strong>{count ?? '\u2014'}</strong><span>{label}</span></div>
            </div>
          ))}
        </div>
        <div className="dashboard-card__actions plugins-actions">
          <Button type="button" onClick={() => setShowCreate((value) => !value)}>
            <span aria-hidden="true" className="plugins-plus">+</span> {showCreate ? 'Hide create form' : 'Create plugin'}
          </Button>
          <Link className="home-page__cta home-page__cta--secondary" to="/console/plugin-categories">
            <AdminIcon name="layers" size={20} /> Manage plugin categories
          </Link>
        </div>

        {showCreate ? (
          <form className="admin-create-form" onSubmit={onSubmit} noValidate>
            {createError ? <Alert variant="error" message={createError} /> : null}
            <FormField id="plugin-category" label="Category">
              <select
                id="plugin-category"
                className="ui-input"
                value={createForm.category_id}
                disabled={categoriesQuery.isLoading || categoriesQuery.isError}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, category_id: event.target.value }))
                }
              >
                <option value="">
                  {categoriesQuery.isLoading ? 'Loading categories...' : 'Select a category'}
                </option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </FormField>
            {categoriesQuery.isError ? (
              <Alert variant="error" message="Plugin categories could not be loaded." />
            ) : null}
            <FormField id="plugin-name" label="Name">
              <Input
                id="plugin-name"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </FormField>
            <FormField id="plugin-summary" label="Short description">
              <Input
                id="plugin-summary"
                maxLength={500}
                value={createForm.short_description ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    short_description: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="plugin-price" label="Price (USD)">
              <Input
                id="plugin-price"
                type="number"
                min="0"
                step="0.01"
                value={createForm.price}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, price: event.target.value }))
                }
              />
            </FormField>
            <FormField id="plugin-version" label="Version">
              <Input
                id="plugin-version"
                maxLength={64}
                value={createForm.version ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, version: event.target.value }))
                }
              />
            </FormField>
            <FormField id="plugin-status" label="Status">
              <select
                id="plugin-status"
                className="ui-input"
                value={createForm.status}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    status: event.target.value as PluginStatus,
                  }))
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </FormField>
            <Button type="submit" isLoading={createMutation.isPending}>Create plugin</Button>
          </form>
        ) : null}

        <div className="admin-filters plugins-filters">
          <label className="plugins-search"><AdminIcon name="search" size={22} />
          <Input
            aria-label="Search plugins"
            placeholder="Search name, description, or compatibility"
            value={search}
            onChange={(event) => { setSearch(event.target.value); resetPage() }}
          />
          </label>
          <select
            className="ui-input"
            aria-label="Filter by status"
            value={status}
            onChange={(event) => { setStatus(event.target.value); resetPage() }}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_review">Pending review</option>
            <option value="published">Published</option>
            <option value="rejected">Rejected</option>
            <option value="archived">Archived</option>
          </select>
          <select
            className="ui-input"
            aria-label="Filter by category"
            value={categoryId}
            onChange={(event) => { setCategoryId(event.target.value); resetPage() }}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <select
            className="ui-input"
            aria-label="Order plugins"
            value={ordering}
            onChange={(event) => { setOrdering(event.target.value as PluginOrdering); resetPage() }}
          >
            <option value="-created_at">Newest first</option>
            <option value="created_at">Oldest first</option>
            <option value="name">Name A–Z</option>
            <option value="-name">Name Z–A</option>
            <option value="price">Price low–high</option>
            <option value="-price">Price high–low</option>
          </select>
        </div>

        {pluginsQuery.isLoading ? <Spinner label="Loading plugins..." /> : pluginsQuery.isError ? (
          <ErrorState
            title="Could not load plugins"
            description="Administrator plugin list could not be loaded."
            action={<Button variant="secondary" onClick={() => pluginsQuery.refetch()}>Retry</Button>}
          />
        ) : (
          <div className="plugins-table-panel">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Plugin</th><th>Category</th><th>Version</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {pluginsQuery.data?.results.map((plugin) => (
                    <tr key={plugin.id}>
                      <td><div className="plugins-product"><span className="plugins-product__icon">{plugin.thumbnail ? <img src={plugin.thumbnail} alt="" loading="lazy" /> : <AdminIcon name="box" size={32} />}</span><div><strong>{plugin.name}</strong><p>{plugin.short_description}</p></div></div></td>
                      <td><span className="plugins-category">{plugin.category.name}</span></td><td>{plugin.version}</td>
                      <td>{plugin.currency} {plugin.price}</td><td><span className={`plugins-status plugins-status--${plugin.status}`}><AdminIcon name={plugin.status === 'published' ? 'check' : plugin.status === 'archived' ? 'archive' : 'clock'} size={16} />{plugin.status.replace('_', ' ')}</span></td>
                      <td><div className="plugins-row-actions"><Link className="plugins-manage" to={`/console/plugins/${plugin.id}`}><AdminIcon name="settings" size={19} />Manage</Link>
                        <details className="plugins-more"><summary aria-label={`More actions for ${plugin.name}`}><span aria-hidden="true">&#8942;</span></summary><div className="plugins-more__menu"><Link to={`/console/plugins/${plugin.id}`}>Edit plugin</Link><button type="button" onClick={(event) => { setCategoryId(plugin.category.id); resetPage(); event.currentTarget.closest('details')?.removeAttribute('open') }}>Show this category</button></div></details>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pluginsQuery.data?.results.length === 0 ? (
                <p className="home-page__subtitle">No plugins match your filters.</p>
              ) : null}
            </div>
            <nav className="plugins-pagination" aria-label="Plugin pagination">
              <span>Showing {pluginsQuery.data?.results.length ? (page - 1) * pageSize + 1 : 0}&ndash;{Math.min(page * pageSize, pluginsQuery.data?.count ?? 0)} of {pluginsQuery.data?.count ?? 0} plugins</span>
              <div><label>Rows per page<select aria-label="Rows per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); resetPage() }}>{[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
              <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>&lsaquo;</button><span className="plugins-pagination__current" aria-current="page">{page}</span><button type="button" aria-label="Next page" disabled={!pluginsQuery.data?.next} onClick={() => setPage(page + 1)}>&rsaquo;</button></div>
            </nav>
          </div>
        )}
      </section>
    </main>
  )
}
