import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { listAdminCategories } from '../../api/categoriesApi'
import { createAdminProduct, listAdminProducts } from '../../api/productsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type { AdminProductCreatePayload, ProductStatus } from '../../types/product'

const emptyCreateForm: AdminProductCreatePayload = {
  category_id: '',
  name: '',
  sku: '',
  short_description: '',
  price: '',
  currency: 'USD',
  status: 'draft',
}

function formatPrice(value: string): string {
  const parsed = Number.parseFloat(value)
  if (Number.isNaN(parsed)) {
    return value
  }
  return parsed.toFixed(2)
}

export function AdminProductsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<AdminProductCreatePayload>(emptyCreateForm)
  const [createError, setCreateError] = useState<string | null>(null)

  const productsQuery = useQuery({
    queryKey: ['admin', 'products', { search, status: statusFilter }],
    queryFn: () =>
      listAdminProducts({
        search: search || undefined,
        status: (statusFilter || undefined) as ProductStatus | undefined,
        page_size: 50,
        ordering: '-created_at',
      }),
  })

  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories', 'product-form'],
    queryFn: () => listAdminCategories({ is_active: true, page_size: 100 }),
  })

  const createMutation = useMutation({
    mutationFn: createAdminProduct,
    onSuccess: async () => {
      toast.success('Product created')
      setCreateForm(emptyCreateForm)
      setShowCreate(false)
      setCreateError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
      navigate('/admin', { replace: true })
    },
    onError: (error) => {
      setCreateError(getApiErrorMessage(error, 'Could not create product.'))
    },
  })

  const onCreateSubmit = (event: FormEvent) => {
    event.preventDefault()
    setCreateError(null)
    createMutation.mutate({
      ...createForm,
      price: formatPrice(createForm.price),
      sku: createForm.sku?.trim() ? createForm.sku.trim() : null,
    })
  }

  const categoryOptions = categoriesQuery.data?.results ?? []

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="admin-products-title"
      >
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="admin-products-title">Products</h1>
        <p className="home-page__subtitle">
          Create and manage marketplace 3D assets.
        </p>

        <div className="dashboard-card__actions">
          <Button type="button" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? 'Hide create form' : 'Create product'}
          </Button>
        </div>

        {showCreate ? (
          <form className="admin-create-form" onSubmit={onCreateSubmit} noValidate>
            {createError ? <Alert variant="error" message={createError} /> : null}
            <FormField id="create-category" label="Category">
              <select
                id="create-category"
                className="ui-input"
                value={createForm.category_id}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    category_id: event.target.value,
                  }))
                }
                required
              >
                <option value="">Select a category</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </FormField>
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
            <FormField id="create-sku" label="SKU / Model ID (optional)">
              <Input
                id="create-sku"
                value={createForm.sku ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    sku: event.target.value,
                  }))
                }
                placeholder="MDL-000142"
                autoComplete="off"
              />
            </FormField>
            <FormField id="create-short-description" label="Short description">
              <Input
                id="create-short-description"
                value={createForm.short_description ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    short_description: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="create-price" label="Price (USD)">
              <Input
                id="create-price"
                type="number"
                min="0"
                step="0.01"
                value={createForm.price}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField id="create-status" label="Status">
              <select
                id="create-status"
                className="ui-input"
                value={createForm.status ?? 'draft'}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    status: event.target.value as ProductStatus,
                  }))
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </FormField>
            <Button type="submit" isLoading={createMutation.isPending}>
              Create product
            </Button>
          </form>
        ) : null}

        <div className="admin-filters">
          <Input
            aria-label="Search products"
            placeholder="Search name, SKU, or description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="ui-input"
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {productsQuery.isLoading ? (
          <Spinner label="Loading products..." />
        ) : productsQuery.isError ? (
          <ErrorState
            title="Could not load products"
            description="Administrator product list could not be loaded."
            action={
              <Button variant="secondary" onClick={() => productsQuery.refetch()}>
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
                  <th scope="col">SKU</th>
                  <th scope="col">Category</th>
                  <th scope="col">Price</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {productsQuery.data?.results.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.sku ?? '—'}</td>
                    <td>{product.category.name}</td>
                    <td>
                      {product.currency} {product.price}
                    </td>
                    <td>{product.status}</td>
                    <td>
                      <Link
                        className="auth-link"
                        to={`/admin/products/${product.id}`}
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {productsQuery.data?.results.length === 0 ? (
              <p className="home-page__subtitle">No products match your filters.</p>
            ) : null}
          </div>
        )}
      </section>
    </main>
  )
}
