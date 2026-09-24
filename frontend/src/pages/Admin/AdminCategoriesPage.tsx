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
    queryKey: ['admin', 'categories', { search, is_active: activeFilter }],
    queryFn: () =>
      listAdminCategories({
        search: search || undefined,
        is_active: activeParam,
        page_size: 50,
      }),
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

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="admin-categories-title"
      >
        <p className="admin-page__eyebrow">Administrator</p>
        <h1 id="admin-categories-title">Categories</h1>
        <p className="home-page__subtitle">
          Organize marketplace products into browsable categories.
        </p>

        <div className="dashboard-card__actions">
          <Button type="button" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? 'Hide create form' : 'Create category'}
          </Button>
        </div>

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
            placeholder="Search name or slug"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="ui-input"
            aria-label="Filter by status"
            value={activeFilter}
            onChange={(event) => setActiveFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
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
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Slug</th>
                  <th scope="col">Parent</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categoriesQuery.data?.results.map((category) => (
                  <tr key={category.id}>
                    <td>{category.name}</td>
                    <td>{category.slug}</td>
                    <td>{category.parent?.name ?? '—'}</td>
                    <td>{category.is_active ? 'Active' : 'Inactive'}</td>
                    <td>
                      <Link
                        className="auth-link"
                        to={`/console/categories/${category.id}`}
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {categoriesQuery.data?.results.length === 0 ? (
              <p className="home-page__subtitle">No categories match your filters.</p>
            ) : null}
          </div>
        )}
      </section>
    </main>
  )
}
