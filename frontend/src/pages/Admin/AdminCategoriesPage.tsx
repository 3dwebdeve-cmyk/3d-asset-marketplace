import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  createAdminCategory,
  listAdminCategories,
} from '../../api/categoriesApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { AdminIcon } from '../../components/admin/AdminIcon'
import type { AdminCategory } from '../../types/category'
import '../../styles/admin-categories.css'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type { AdminCategoryCreatePayload } from '../../types/category'

const emptyCreateForm: AdminCategoryCreatePayload = {
  name: '',
  description: '',
  image: '',
  parent_id: null,
}

export function AdminCategoriesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [hierarchy, setHierarchy] = useState(false)
  const [activeFilter, setActiveFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] =
    useState<AdminCategoryCreatePayload>(emptyCreateForm)
  const [createError, setCreateError] = useState<string | null>(null)

  const activeParam =
    activeFilter === 'active'
      ? true
      : activeFilter === 'inactive'
        ? false
        : undefined

  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories', { search, is_active: activeFilter, page, pageSize }],
    queryFn: () =>
      listAdminCategories({
        search: search || undefined,
        is_active: activeParam,
        page,
        page_size: pageSize,
      }),
  })

  const summaryQuery = useQuery({
    queryKey: ['admin', 'categories', 'summary'],
    queryFn: async () => {
      const all: AdminCategory[] = []
      let current = 1
      while (true) {
        const batch = await listAdminCategories({ page: current, page_size: 100 })
        all.push(...batch.results)
        if (!batch.next || batch.results.length === 0) break
        current += 1
      }
      return all
    },
  })

  const parentOptionsQuery = useQuery({
    queryKey: ['admin', 'categories', 'parent-options'],
    queryFn: () => listAdminCategories({ is_active: true, page_size: 100 }),
  })

  const createMutation = useMutation({
    mutationFn: createAdminCategory,
    onSuccess: async () => {
      toast.success('Category created')
      setCreateForm(emptyCreateForm)
      setShowCreate(false)
      setCreateError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] })
      navigate('/console', { replace: true })
    },
    onError: (error) => {
      setCreateError(getApiErrorMessage(error, 'Could not create category.'))
    },
  })

  const onCreateSubmit = (event: FormEvent) => {
    event.preventDefault()
    setCreateError(null)
    createMutation.mutate({
      ...createForm,
      parent_id: createForm.parent_id || null,
    })
  }

  const parentOptions = parentOptionsQuery.data?.results ?? []
  const summary = summaryQuery.data
  const rows = categoriesQuery.data?.results ?? []
  const count = categoriesQuery.data?.count ?? 0
  const pages = Math.max(1, Math.ceil(count / pageSize))

  return (
    <main className="dashboard-page admin-categories-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="admin-categories-title"
      >
        <header className="categories-heading">
        <span className="categories-heading__icon"><AdminIcon name="layers" size={32} /></span>
        <div>
        <h1 id="admin-categories-title">Categories</h1>
        <p className="home-page__subtitle">
          Organize marketplace products into browsable categories.
        </p>
        </div>
        <svg className="categories-waves" viewBox="0 0 1000 140" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => <path key={i} d={`M0 ${120 + i * 3} C350 ${-80 + i * 8} 500 ${250 - i * 5} 1000 ${-60 + i * 5}`} />)}
        </svg>
        </header>
        <div className="categories-summary">
          {([
            ['folder', summary?.length, 'Total categories'],
            ['check', summary?.filter((item) => item.is_active).length, 'Active categories'],
            ['archive', summary?.filter((item) => !item.is_active).length, 'Archived'],
            ['layers', summary?.filter((item) => item.parent).length, 'With parent category'],
          ] as const).map(([icon, value, label]) => <div className="categories-stat" key={label}>
            <span className={`categories-stat__icon${icon === 'check' ? ' categories-stat__icon--green' : ''}`}><AdminIcon name={icon} size={28} /></span>
            <div><strong>{value ?? '—'}</strong><span>{label}</span></div>
          </div>)}
        </div>

        <div className="dashboard-card__actions">
          <Button type="button" onClick={() => setShowCreate((value) => !value)}>
            <AdminIcon name="plus-circle" size={16} />
            {showCreate ? 'Hide create form' : 'Create category'}
          </Button>
          <Button type="button" variant="secondary" aria-pressed={hierarchy} onClick={() => setHierarchy((value) => !value)}>
            <AdminIcon name="folder" size={16} /> Manage hierarchy
          </Button>
        </div>
        {hierarchy ? <section className="categories-hierarchy" aria-label="Category hierarchy">
          <h2>Category hierarchy</h2>
          <p>Select a category to edit its parent.</p>
          {summary?.map((category) => <Link key={category.id} to={`/console/categories/${category.id}`}>
            {category.parent ? `${category.parent.name} / ` : ''}{category.name}
          </Link>)}
        </section> : null}

        {showCreate ? (
          <form className="admin-create-form" onSubmit={onCreateSubmit} noValidate>
            {createError ? <Alert variant="error" message={createError} /> : null}
            <FormField id="create-name" label="Name">
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="create-description" label="Description">
              <Input
                id="create-description"
                value={createForm.description ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="create-image" label="Image URL">
              <Input
                id="create-image"
                type="text"
                inputMode="url"
                placeholder="https://example.com/category.jpg"
                value={createForm.image ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    image: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="create-parent" label="Parent category">
              <select
                id="create-parent"
                className="ui-input"
                value={createForm.parent_id ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({
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
            <Button type="submit" isLoading={createMutation.isPending}>
              Create category
            </Button>
          </form>
        ) : null}

        <div className="admin-filters">
          <Input
            aria-label="Search categories"
            placeholder="Search category name or slug..."
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1) }}
          />
          <select
            className="ui-input"
            aria-label="Filter by status"
            value={activeFilter}
            onChange={(event) => { setActiveFilter(event.target.value); setPage(1) }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <div className="categories-view" aria-label="Category view">
            <button type="button" aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}>☷</button>
            <button type="button" aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>⊞</button>
          </div>
        </div>

        {categoriesQuery.isLoading ? (
          <Spinner label="Loading categories..." />
        ) : categoriesQuery.isError ? (
          <ErrorState
            title="Could not load categories"
            description="Administrator category list could not be loaded."
            action={
              <Button variant="secondary" onClick={() => categoriesQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : (
          <div className={`admin-table-wrap categories-table-panel${view === 'grid' ? ' categories-table-panel--grid' : ''}`}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Slug</th>
                  <th scope="col">Parent</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categoriesQuery.data?.results.map((category) => (
                  <tr key={category.id}>
                    <td><span className="categories-name"><span className="categories-folder"><AdminIcon name="folder" size={20} /></span>{category.name}</span></td>
                    <td><code className="categories-slug">{category.slug}</code></td>
                    <td>{category.parent?.name ?? '—'}</td>
                    <td><span className={`categories-status${category.is_active ? ' categories-status--active' : ''}`}><AdminIcon name={category.is_active ? 'check' : 'archive'} size={15} />{category.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <Link
                        className="categories-manage"
                        to={`/console/categories/${category.id}`}
                      >
                        <AdminIcon name="settings" size={15} /> Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {categoriesQuery.data?.results.length === 0 ? (
              <p className="home-page__subtitle">No categories match your filters.</p>
            ) : null}
            <footer className="categories-pagination">
              <span>Showing {count ? (page - 1) * pageSize + 1 : 0}–{Math.min((page - 1) * pageSize + rows.length, count)} of {count} categories</span>
              <label>Rows per page <select aria-label="Rows per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
                {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
              </select></label>
              <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
              <span className="categories-current">{page}</span>
              <span>of {pages}</span>
              <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
            </footer>
          </div>
        )}
      </section>
    </main>
  )
}
