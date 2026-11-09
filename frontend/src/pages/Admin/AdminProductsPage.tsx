import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { listAdminCategories } from '../../api/categoriesApi'
import {
  bulkDeleteAdminProducts,
  createAdminProduct,
  listAdminProducts,
  restoreAdminProduct,
} from '../../api/productsApi'
import { AdminIcon } from '../../components/admin/AdminIcon'
import '../../styles/admin-products.css'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import { PRODUCT_ARCHIVE_CONFIRMATION, PRODUCTS_ARCHIVE_CONFIRMATION, PRODUCT_RESTORE_CONFIRMATION } from '../../lib/productArchive'
import { isFreeProduct } from '../../types/product'
import type { AdminProductCreatePayload, ProductStatus } from '../../types/product'
import { UploaderImportsPanel } from './UploaderImportsPanel'

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
  const [folderSearch, setFolderSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [showAllCategories, setShowAllCategories] = useState(false)
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Number(searchParams.get('page_size')) || 10
  const setPagination = (nextPage: number, size = pageSize) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(nextPage))
    params.set('page_size', String(size))
    setSearchParams(params)
  }
  const statusFilter = archived ? 'archived' : searchParams.get('status')?.trim() ?? ''
  const importBatchFilter = searchParams.get('import_batch_id')?.trim() ?? ''
  const [batchInput, setBatchInput] = useState(importBatchFilter)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<AdminProductCreatePayload>(emptyCreateForm)
  const [createError, setCreateError] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const productsQuery = useQuery({
    queryKey: [
      'admin',
      'products',
      { search, status: statusFilter, import_batch_id: importBatchFilter, categoryId, page, pageSize },
    ],
    queryFn: () =>
      listAdminProducts({
        search: search || undefined,
        status: (statusFilter || undefined) as ProductStatus | undefined,
        import_batch_id: importBatchFilter || undefined,
        category_id: categoryId || undefined,
        page,
        page_size: pageSize,
        ordering: '-created_at',
      }),
  })

  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories', 'product-form'],
    queryFn: () => listAdminCategories({ is_active: true, page_size: 100 }),
  })

  const summaryQuery = useQuery({
    queryKey: ['admin', 'products', 'summary'],
    queryFn: async () => {
      const [total, published, draft, archivedProducts] = await Promise.all([
        listAdminProducts({ page_size: 1 }),
        listAdminProducts({ status: 'published', page_size: 1 }),
        listAdminProducts({ status: 'draft', page_size: 1 }),
        listAdminProducts({ status: 'archived', page_size: 1 }),
      ])
      return { total: total.count, published: published.count, draft: draft.count, archived: archivedProducts.count }
    },
  })

  const folderCountsQuery = useQuery({
    queryKey: ['admin', 'products', 'folder-counts', archived, categoriesQuery.data?.results.map(category => category.id)],
    enabled: !!categoriesQuery.data,
    staleTime: 60_000,
    queryFn: async () => Object.fromEntries(await Promise.all(
      (categoriesQuery.data?.results ?? []).map(async category => {
        const products = await listAdminProducts({ category_id: category.id, status: archived ? 'archived' : undefined, page_size: 1 })
        return [category.id, products.count] as const
      }),
    )),
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

  const deleteMutation = useMutation({
    mutationFn: (productIds: string[]) => bulkDeleteAdminProducts(productIds),
    onSuccess: async (result) => {
      if (result.archived.length) {
        toast.success(`${result.archived.length} moved to Archived. Existing buyers keep their downloads.`)
      }
      if (result.not_found.length) toast.error(`${result.not_found.length} products were not found.`)
      setSelectedIds(new Set())
      await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
      await queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === 'string' && /^public-(models|products|product)(-|$)/.test(query.queryKey[0]),
      })
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not delete the selected products.'))
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (productId: string) => restoreAdminProduct(productId),
    onSuccess: async () => {
      setRestoreError(null)
      toast.success('Product restored to Products as a Draft. Review it before publishing.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
    },
    onError: (error) => setRestoreError(getApiErrorMessage(error, 'Could not restore product. Please try again.')),
  })

  const confirmDelete = (ids: string[]) => {
    if (ids.length === 0) {
      return
    }
    if (
      window.confirm(ids.length === 1 ? PRODUCT_ARCHIVE_CONFIRMATION : PRODUCTS_ARCHIVE_CONFIRMATION)
    ) {
      deleteMutation.mutate(ids)
    }
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

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
    params.delete('page')
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
  const visibleProducts = productsQuery.data?.results ?? []
  // Only rows on screen can be selected; a filter change drops hidden ones from the count.
  const visibleSelectedIds = visibleProducts
    .map((product) => product.id)
    .filter((id) => selectedIds.has(id))
  const allVisibleSelected =
    visibleProducts.length > 0 && visibleSelectedIds.length === visibleProducts.length

  if (!archived && statusFilter === 'archived') {
    const params = new URLSearchParams(searchParams)
    params.delete('status')
    return <Navigate to={`/console/archived${params.size ? `?${params}` : ''}`} replace />
  }

  return (
    <main className="dashboard-page admin-products-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="admin-products-title"
      >
        <header className="products-heading">
        <span className="products-heading__icon"><AdminIcon name="box" size={32} /></span>
        <div>
        <h1 id="admin-products-title">
          {archived ? 'Archived products' : isQaQueue ? 'QA queue' : 'Products'}
        </h1>
        <p className="home-page__subtitle">
          {archived
            ? 'Products removed from the website. Restore to Products brings them back as Drafts for review. Existing buyers keep their purchases and downloads.'
            : isQaQueue
              ? 'Review imported products pending approve or reject.'
              : 'Create and manage marketplace 3D assets.'}
        </p>

        </div>
        <div className="dashboard-card__actions products-heading__actions">
          {archived ? (
            <Link className="home-page__cta home-page__cta--secondary" to="/console/products">Back to products</Link>
          ) : (
            <>
              <Button type="button" onClick={() => setShowCreate((value) => !value)}>
                <AdminIcon name="plus-circle" size={16} /> {showCreate ? 'Hide create form' : 'Create product'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => updateFilters({ status: isQaQueue ? '' : 'pending_review' })}
              >
                <AdminIcon name="check-square" size={16} /> {isQaQueue ? 'All products' : 'QA queue'}
              </Button>
              <Link className="home-page__cta home-page__cta--secondary" to="/console/archived">
                View archived products
              </Link>
            </>
          )}
        </div>

        </header>
        <div className="products-summary">
          {([
            ['box', summaryQuery.data?.total, 'Total products', 'red'],
            ['check-circle', summaryQuery.data?.published, 'Published', 'green'],
            ['clock', summaryQuery.data?.draft, 'Draft', 'amber'],
            ['archive', summaryQuery.data?.archived, 'Archived', 'red'],
            ['layers', categoriesQuery.data?.count, 'Categories', 'red'],
          ] as const).map(([icon, count, label, tone]) => (
            <div className={`products-summary__card products-summary__card--${tone}`} key={label}>
              <span className="products-summary__icon"><AdminIcon name={icon} size={28} /></span>
              <div><strong>{count ?? '\u2014'}</strong><span>{label}</span></div>
            </div>
          ))}
        </div>
        {isQaQueue ? <UploaderImportsPanel /> : null}
        {restoreError ? <Alert variant="error" message={restoreError} /> : null}
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

        <div className="products-workspace">
          <aside className="products-folders" aria-label="Product folders">
            <div className="products-folders__heading"><h2><AdminIcon name="folder" /> Folders <span className="products-count">{categoriesQuery.data?.count ?? 0}</span></h2><Link to="/console/categories" aria-label="Open categories" className="products-add-folder">+</Link></div>
            <label className="products-folder-search"><AdminIcon name="search" size={17} /><Input aria-label="Search folders" placeholder="Search folder..." value={folderSearch} onChange={(event) => setFolderSearch(event.target.value)} /></label>
            <button type="button" className={`products-folder ${!categoryId ? 'is-active' : ''}`} onClick={() => { setCategoryId(''); setPagination(1) }}><AdminIcon name="box" size={18} /><span>All Products</span><span className="products-folder__count">{summaryQuery.data?.total ?? '\u2014'}</span></button>
            {categoryOptions.filter((category) => category.name.toLowerCase().includes(folderSearch.toLowerCase())).slice(0, showAllCategories ? undefined : 10).map((category) => (
              <button type="button" key={category.id} className={`products-folder ${categoryId === category.id ? 'is-active' : ''}`} onClick={() => { setCategoryId(category.id); setPagination(1) }}><AdminIcon name="folder" size={18} /><span>{category.name}</span><span className="products-folder__count">{folderCountsQuery.data?.[category.id] ?? "\u2014"}</span></button>
            ))}
            {categoriesQuery.isError ? <p role="alert">Could not load folders.</p> : null}
            <button type="button" className="products-show-folders" onClick={() => setShowAllCategories(!showAllCategories)}>{showAllCategories ? 'Show fewer categories' : 'Show all categories'}<AdminIcon name="chevron-down" size={16} /></button>
          </aside>
          <div className="products-workspace__main">
        <div className="admin-filters products-filters">
          <Input
            aria-label="Search products"
            placeholder="Search name, SKU, or description"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPagination(1) }}
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
              <AdminIcon name="filter" size={16} /> Filter batch
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
          <div className="admin-table-wrap products-table-panel">
            <div className="products-table-heading"><h2>{archived ? 'Archived products' : 'Products'} <span className="products-count">{productsQuery.data?.count ?? 0}</span></h2>
            {!archived ? <div className="dashboard-card__actions">
              <Button
                type="button"
                variant="secondary"
                disabled={visibleSelectedIds.length === 0}
                isLoading={deleteMutation.isPending}
                onClick={() => confirmDelete(visibleSelectedIds)}
              >
                Delete selected ({visibleSelectedIds.length})
              </Button>
            </div> : null}
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  {!archived ? <th scope="col">
                    <input
                      type="checkbox"
                      aria-label="Select all products on this page"
                      checked={allVisibleSelected}
                      onChange={() =>
                        setSelectedIds(
                          allVisibleSelected
                            ? new Set()
                            : new Set(visibleProducts.map((product) => product.id)),
                        )
                      }
                    />
                  </th> : null}
                  <th scope="col">Product</th>
                  <th scope="col">SKU</th>
                  <th scope="col">Status</th>
                  <th scope="col">Import batch</th>
                  <th scope="col">Price</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.map((product) => (
                  <tr key={product.id}>
                    {!archived ? <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${product.name}`}
                        checked={selectedIds.has(product.id)}
                        onChange={() => toggleSelected(product.id)}
                      />
                    </td> : null}
                    <td><span className="products-product"><span className="products-thumbnail">{product.thumbnail ? <img src={product.thumbnail} alt="" loading="lazy" /> : <AdminIcon name="box" size={24} />}</span><span>{product.name}</span></span></td>
                    <td><span className="products-sku">{product.sku ?? "\u2014"}</span></td>
                    <td><span className={`products-status products-status--${product.status}`}>{product.status === 'published' ? <AdminIcon name="check" size={14} /> : null}{product.status.replace(/_/g, ' ')}</span></td>
                    <td>{product.import_batch_id || '—'}</td>
                    <td>
                      {isFreeProduct(product) ? 'Free' : `${product.currency} ${product.price}`}
                    </td>
                    <td>
                      <Link
                        className="auth-link products-manage"
                        to={`/console/${archived ? 'archived' : 'products'}/${product.id}`}
                      >
                        <AdminIcon name="settings" size={15} /> Manage
                      </Link>{' '}
                      {archived ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={restoreMutation.isPending}
                          isLoading={restoreMutation.isPending && restoreMutation.variables === product.id}
                          onClick={() => {
                            if (window.confirm(PRODUCT_RESTORE_CONFIRMATION)) {
                              setRestoreError(null)
                              restoreMutation.mutate(product.id)
                            }
                          }}
                        >
                          Restore to Products
                        </Button>
                      ) : null}
                      {!archived ? <Button
                        type="button"
                        variant="secondary"
                        disabled={deleteMutation.isPending}
                        onClick={() => confirmDelete([product.id])}
                        aria-label={`Delete ${product.name}`}
                      >
                        <AdminIcon name="trash" size={15} /> Delete
                      </Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {productsQuery.data?.results.length === 0 ? (
              <p className="home-page__subtitle">{archived ? 'No archived products match your filters.' : 'No products match your filters.'}</p>
            ) : null}
            <div className="products-pagination">
              <span>Showing {visibleProducts.length ? (page - 1) * pageSize + 1 : 0}&ndash;{Math.min(page * pageSize, productsQuery.data?.count ?? 0)} of {productsQuery.data?.count ?? 0} products</span>
              <div><label>Rows per page <select aria-label="Rows per page" value={pageSize} onChange={(event) => setPagination(1, Number(event.target.value))}>{[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
              <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPagination(page - 1)}>&lsaquo;</button><span className="products-pagination__current">{page}</span><button type="button" aria-label="Next page" disabled={!productsQuery.data?.next} onClick={() => setPagination(page + 1)}>&rsaquo;</button></div>
            </div>
          </div>
        )}
          </div>
        </div>
      </section>
    </main>
  )
}