import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  createAdminPluginCategory,
  listAdminPluginCategories,
} from '../../api/pluginsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type { PluginCategoryCreatePayload } from '../../types/plugin'

const emptyForm: PluginCategoryCreatePayload = { name: '', description: '', image: '' }

export function AdminPluginCategoriesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<PluginCategoryCreatePayload>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const debouncedSearch = useDebouncedValue(search)
  const isActive =
    activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined

  const categoriesQuery = useQuery({
    queryKey: [
      'admin',
      'plugin-categories',
      { search: debouncedSearch, activeFilter, page },
    ],
    queryFn: () =>
      listAdminPluginCategories({
        search: debouncedSearch || undefined,
        is_active: isActive,
        page,
        page_size: 20,
      }),
  })
  const createMutation = useMutation({
    mutationFn: createAdminPluginCategory,
    onSuccess: async () => {
      toast.success('Plugin category created')
      await queryClient.invalidateQueries({
        queryKey: ['admin', 'plugin-categories'],
        refetchType: 'none',
      })
      navigate('/admin', { replace: true })
    },
    onError: (error) =>
      setFormError(getApiErrorMessage(error, 'Could not create plugin category.')),
  })
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const error =
      form.name.trim().length < 2 ? 'Name must be at least 2 characters.' : null
    setFormError(error)
    if (!error) createMutation.mutate({ ...form, name: form.name.trim() })
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="plugin-categories-title">
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="plugin-categories-title">Plugin categories</h1>
        <p className="home-page__subtitle">
          Organize plugins independently from marketplace product categories.
        </p>
        <div className="dashboard-card__actions">
          <Button type="button" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? 'Hide create form' : 'Create plugin category'}
          </Button>
          <Link className="home-page__cta home-page__cta--secondary" to="/admin/plugins">
            Back to plugins
          </Link>
        </div>

        {showCreate ? (
          <form className="admin-create-form" onSubmit={onSubmit} noValidate>
            {formError ? <Alert variant="error" message={formError} /> : null}
            <FormField id="plugin-category-name" label="Name">
              <Input
                id="plugin-category-name"
                maxLength={255}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </FormField>
            <FormField id="plugin-category-description" label="Description">
              <Input
                id="plugin-category-description"
                value={form.description ?? ''}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </FormField>
            <FormField id="plugin-category-image" label="Image URL">
              <Input
                id="plugin-category-image"
                type="url"
                value={form.image ?? ''}
                onChange={(event) =>
                  setForm((current) => ({ ...current, image: event.target.value }))
                }
              />
            </FormField>
            <Button type="submit" isLoading={createMutation.isPending}>
              Create plugin category
            </Button>
          </form>
        ) : null}

        <div className="admin-filters">
          <Input
            aria-label="Search plugin categories"
            placeholder="Search name or slug"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1) }}
          />
          <select
            className="ui-input"
            aria-label="Filter plugin categories by status"
            value={activeFilter}
            onChange={(event) => { setActiveFilter(event.target.value); setPage(1) }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {categoriesQuery.isLoading ? <Spinner label="Loading plugin categories..." /> :
          categoriesQuery.isError ? (
            <ErrorState
              title="Could not load plugin categories"
              description="Administrator plugin category list could not be loaded."
              action={<Button variant="secondary" onClick={() => categoriesQuery.refetch()}>Retry</Button>}
            />
          ) : (
            <>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {categoriesQuery.data?.results.map((category) => (
                      <tr key={category.id}>
                        <td>{category.name}</td>
                        <td>{category.slug}</td>
                        <td>{category.is_active ? 'Active' : 'Inactive'}</td>
                        <td>
                          <Link className="auth-link" to={`/admin/plugin-categories/${category.id}`}>
                            Manage
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {categoriesQuery.data?.results.length === 0 ? (
                  <p className="home-page__subtitle">
                    No plugin categories match your filters.
                  </p>
                ) : null}
              </div>
              <div className="dashboard-card__actions" aria-label="Plugin category pagination">
                <Button type="button" variant="secondary" disabled={!categoriesQuery.data?.previous} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                <span>Page {page}</span>
                <Button type="button" variant="secondary" disabled={!categoriesQuery.data?.next} onClick={() => setPage((value) => value + 1)}>Next</Button>
              </div>
            </>
          )}
      </section>
    </main>
  )
}
