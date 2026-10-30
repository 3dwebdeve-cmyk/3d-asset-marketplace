import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { listAdminCategories } from '../../api/categoriesApi'
import { archiveAdminProduct, createAdminProduct, listAdminProducts, removeAdminProduct } from '../../api/productsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import {
  ADMIN_PRODUCT_REMOVAL_CONFIRMATION, ADMIN_PRODUCT_REMOVAL_SUCCESS,
  PRODUCT_REMOVAL_CONFIRMATION, PRODUCT_REMOVAL_SUCCESS,
} from '../../lib/productRemoval'
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

export function AdminProductsPage({ archived = false }: { archived?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const statusFilter = archived ? 'archived' : searchParams.get('status')?.trim() ?? ''
  const importBatchFilter = searchParams.get('import_batch_id')?.trim() ?? ''
  const [batchInput, setBatchInput] = useState(importBatchFilter)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<AdminProductCreatePayload>(emptyCreateForm)
  const [createError, setCreateError] = useState<string | null>(null)
  const [removalError, setRemovalError] = useState<string | null>(null)

  const productsQuery = useQuery({
    queryKey: [
      'admin',
      'products',
      { search, status: statusFilter, import_batch_id: importBatchFilter },
    ],
    queryFn: () =>
      listAdminProducts({
        search: search || undefined,
        status: (statusFilter || undefined) as ProductStatus | undefined,
        import_batch_id: importBatchFilter || undefined,
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
      navigate('/console', { replace: true })
    },
    onError: (error) => {
      setCreateError(getApiErrorMessage(error, 'Could not create product.'))
    },
  })

  const removalMutation = useMutation({
    mutationFn: archiveAdminProduct,
    onSuccess: async () => {
      setRemovalError(null)
      toast.success(PRODUCT_REMOVAL_SUCCESS)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
      await queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === 'string' && /^public-(models|products|product)-/.test(query.queryKey[0]),
      })
    },
    onError: (error) => setRemovalError(getApiErrorMessage(error, 'Could not remove product from site.')),
  })

  const adminRemovalMutation = useMutation({
    mutationFn: removeAdminProduct,
    onSuccess: async () => {
      setRemovalError(null)
      toast.success(ADMIN_PRODUCT_REMOVAL_SUCCESS)
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
    onError: (error) => setRemovalError(getApiErrorMessage(error, 'Could not remove product from admin.')),
  })

  const updateFilters = (next: { status?: string; import_batch_id?: string }) => {
    const params = new URLSearchParams(searchParams)
    if (next.status !== undefined) {
      if (next.status) {
        params.set('status', next.status)
      } else {
        params.delete('status')
      }
    }
    if (next.import_batch_id !== undefined) {
      const batch = next.import_batch_id.trim()
      if (batch) {
        params.set('import_batch_id', batch)
      } else {
        params.delete('import_batch_id')
      }
    }
    setSearchParams(params)
  }

  const onCreateSubmit = (event: FormEvent) => {
    event.preventDefault()
    setCreateError(null)
    createMutation.mutate({
      ...createForm,
      price: formatPrice(createForm.price),
      sku: createForm.sku?.trim() ? createForm.sku.trim() : null,
    })
  }

  const onBatchFilterSubmit = (event: FormEvent) => {
    event.preventDefault()
    updateFilters({ import_batch_id: batchInput })
  }

  const categoryOptions = categoriesQuery.data?.results ?? []
  const isQaQueue = statusFilter === 'pending_review'

  if (!archived && statusFilter === 'archived') {
    const params = new URLSearchParams(searchParams)
    params.delete('status')
    return <Navigate to={`/console/archived${params.size ? `?${params}` : ''}`} replace />
  }

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="admin-products-title"
      >
        <p className="admin-page__eyebrow">Administrator</p>
        <h1 id="admin-products-title">
          {archived ? 'Archived products' : isQaQueue ? 'QA queue' : 'Products'}
        </h1>
        <p className="home-page__subtitle">
          {archived
            ? 'Products removed from the public site. Remove from admin to hide them here too; existing buyers keep their purchases and downloads.'
            : isQaQueue
              ? 'Review imported products pending approve or reject.'
              : 'Create and manage marketplace 3D assets.'}
        </p>

        <div className="dashboard-card__actions">
          {archived ? (
            <Link className="home-page__cta home-page__cta--secondary" to="/console/products">Back to products</Link>
          ) : (
            <>
              <Button type="button" onClick={() => setShowCreate((value) => !value)}>
                {showCreate ? 'Hide create form' : 'Create product'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => updateFilters({ status: isQaQueue ? '' : 'pending_review' })}
              >
                {isQaQueue ? 'All products' : 'QA queue'}
              </Button>
              <Link className="home-page__cta home-page__cta--secondary" to="/console/archived">
                View archived products
              </Link>
            </>
          )}
        </div>

        {!archived ? (
          <p className="home-page__subtitle">
            Removing a product hides it from the public site. Existing buyers keep their purchases
            and downloads. Removed products move to the Archived section.
          </p>
        ) : null}
        {removalError ? <Alert variant="error" message={removalError} /> : null}

        {!archived && showCreate ? (
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
                <option value="pending_review">Pending review</option>
                <option value="published">Published</option>
                <option value="rejected">Rejected</option>
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
          {!archived ? (
            <select
              className="ui-input"
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => updateFilters({ status: event.target.value })}
            >
              <option value="">All current statuses</option>
              <option value="draft">Draft</option>
              <option value="pending_review">Pending review</option>
              <option value="published">Published</option>
              <option value="rejected">Rejected</option>
            </select>
          ) : null}
          <form className="admin-filters" onSubmit={onBatchFilterSubmit}>
            <Input
              aria-label="Filter by import batch ID"
              placeholder="Import batch ID"
              value={batchInput}
              onChange={(event) => setBatchInput(event.target.value)}
              autoComplete="off"
            />
            <Button type="submit" variant="secondary">
              Filter batch
            </Button>
          </form>
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
                  <th scope="col">Status</th>
                  <th scope="col">Import batch</th>
                  <th scope="col">Price</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {productsQuery.data?.results.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.sku ?? '—'}</td>
                    <td>{product.status}</td>
                    <td>{product.import_batch_id || '—'}</td>
                    <td>
                      {product.currency} {product.price}
                    </td>
                    <td>
                      <Link
                        className="auth-link"
                        to={`/console/${archived ? 'archived' : 'products'}/${product.id}`}
                      >
                        Manage
                      </Link>
                      {archived ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={adminRemovalMutation.isPending}
                          isLoading={adminRemovalMutation.isPending && adminRemovalMutation.variables === product.id}
                          onClick={() => {
                            if (window.confirm(ADMIN_PRODUCT_REMOVAL_CONFIRMATION)) {
                              setRemovalError(null)
                              adminRemovalMutation.mutate(product.id)
                            }
                          }}
                        >
                          Remove from admin
                        </Button>
                      ) : <Button
                        type="button"
                        variant="secondary"
                        disabled={product.status === 'archived' || removalMutation.isPending}
                        isLoading={removalMutation.isPending && removalMutation.variables === product.id}
                        onClick={() => {
                          if (window.confirm(PRODUCT_REMOVAL_CONFIRMATION)) {
                            setRemovalError(null)
                            removalMutation.mutate(product.id)
                          }
                        }}
                      >
                        {product.status === 'archived' ? 'Removed from site' : 'Remove from site'}
                      </Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {productsQuery.data?.results.length === 0 ? (
              <p className="home-page__subtitle">{archived ? 'No archived products match your filters.' : 'No products match your filters.'}</p>
            ) : null}
          </div>
        )}
      </section>
    </main>
  )
}
