import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { listAdminCategories } from '../../api/categoriesApi'
import {
  approveAdminProduct,
  archiveAdminProduct,
  bulkDeleteAdminProducts,
  getAdminProduct,
  rejectAdminProduct,
  requeueAdminProduct,
  updateAdminProduct,
} from '../../api/productsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage, isHttpNotFound } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type {
  AdminProductApprovePayload,
  AdminProductUpdatePayload,
  ProductLicenseType,
  ProductStatus,
} from '../../types/product'
import { isFreeProduct } from '../../types/product'
import { PricingChoice } from './PricingChoice'
import type { PricingMode } from './PricingChoice'
import { ProductMediaSection } from './ProductMediaSection'
import { NotFoundPage } from '../NotFound/NotFoundPage'

export function AdminProductDetailPage() {
  const { productId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AdminProductUpdatePayload>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [qaNotes, setQaNotes] = useState('')
  const [qaError, setQaError] = useState<string | null>(null)
  const [approvePrice, setApprovePrice] = useState('')
  const [approvePricing, setApprovePricing] = useState<PricingMode>('paid')
  const [formPricing, setFormPricing] = useState<PricingMode>('paid')

  const productQuery = useQuery({
    queryKey: ['admin', 'products', productId],
    queryFn: () => getAdminProduct(productId),
    enabled: Boolean(productId),
  })

  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories', 'product-form'],
    queryFn: () => listAdminCategories({ is_active: true, page_size: 100 }),
  })

  // Hydrate the form once per product. Refetches after media uploads or QA actions
  // must not overwrite edits the administrator has not saved yet.
  const [hydratedProductId, setHydratedProductId] = useState<string | null>(null)

  useEffect(() => {
    const product = productQuery.data
    if (!product || hydratedProductId === product.id) {
      return
    }
    setHydratedProductId(product.id)
    setApprovePrice(Number(product.price) > 0 ? product.price : '')
    setApprovePricing(isFreeProduct(product) ? 'free' : 'paid')
    setFormPricing(isFreeProduct(product) ? 'free' : 'paid')
    setForm({
      category_id: product.category.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      import_batch_id: product.import_batch_id,
      import_source: product.import_source,
      glb_checksum: product.glb_checksum,
      has_thumbnail: product.has_thumbnail,
      has_preview: product.has_preview,
      has_package: product.has_package,
      description: product.description,
      short_description: product.short_description,
      price: product.price,
      currency: product.currency,
      discount_price: product.discount_price,
      thumbnail: product.thumbnail,
      preview_model: product.preview_model,
      preview_video: product.preview_video,
      polygon_count: product.polygon_count,
      vertex_count: product.vertex_count,
      software_used: product.software_used,
      animated: product.animated,
      rigged: product.rigged,
      pbr_ready: product.pbr_ready,
      game_ready: product.game_ready,
      license_type: product.license_type,
      status: product.status,
    })
  }, [productQuery.data, hydratedProductId])

  const invalidateProduct = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'products', productId] })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: AdminProductUpdatePayload) =>
      updateAdminProduct(productId, payload),
    onSuccess: async () => {
      toast.success('Product updated')
      setFormError(null)
      await invalidateProduct()
      navigate('/console', { replace: true })
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not update product.'))
    },
  })

  const archiveMutation = useMutation({
    mutationFn: () => archiveAdminProduct(productId),
    onSuccess: async () => {
      toast.success('Product archived')
      await invalidateProduct()
      navigate('/console', { replace: true })
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not archive product.'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => bulkDeleteAdminProducts([productId]),
    onSuccess: async (result) => {
      toast.success(
        result.archived.length
          ? 'A customer owns this model, so it was archived (hidden) instead of deleted.'
          : 'Product deleted',
      )
      await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
      navigate('/console/products', { replace: true })
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not delete product.'))
    },
  })

  const approveMutation = useMutation({
    mutationFn: (pricing: AdminProductApprovePayload) => approveAdminProduct(productId, pricing),
    onSuccess: async (_product, pricing) => {
      toast.success(
        pricing.pricing === 'free'
          ? 'Published as a free download'
          : 'Product approved and published',
      )
      setQaError(null)
      await invalidateProduct()
    },
    onError: (error) => {
      setQaError(getApiErrorMessage(error, 'Could not approve product.'))
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () =>
      rejectAdminProduct(productId, {
        reason: rejectReason.trim(),
        ...(qaNotes.trim() ? { qa_notes: qaNotes.trim() } : {}),
      }),
    onSuccess: async () => {
      toast.success('Product rejected')
      setQaError(null)
      setRejectReason('')
      setQaNotes('')
      await invalidateProduct()
    },
    onError: (error) => {
      setQaError(getApiErrorMessage(error, 'Could not reject product.'))
    },
  })

  const requeueMutation = useMutation({
    mutationFn: () => requeueAdminProduct(productId),
    onSuccess: async () => {
      toast.success('Product requeued for review')
      setQaError(null)
      await invalidateProduct()
    },
    onError: (error) => {
      setQaError(getApiErrorMessage(error, 'Could not requeue product.'))
    },
  })

  const qaPending =
    approveMutation.isPending || rejectMutation.isPending || requeueMutation.isPending

  const onApprove = () => {
    if (approvePricing === 'free') {
      setQaError(null)
      approveMutation.mutate({ pricing: 'free' })
      return
    }
    const price = Number.parseFloat(approvePrice)
    if (!Number.isFinite(price) || price <= 0) {
      setQaError('Enter a price above 0, or choose Free.')
      return
    }
    setQaError(null)
    approveMutation.mutate({ pricing: 'paid', price: price.toFixed(2) })
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (formPricing === 'free') {
      saveMutation.mutate({ ...form, price: '0.00', discount_price: null })
      return
    }
    const price = Number.parseFloat(String(form.price ?? ''))
    if (!Number.isFinite(price) || price <= 0) {
      setFormError('Enter a price above 0, or choose Free.')
      return
    }
    saveMutation.mutate(form)
  }

  const onReject = () => {
    if (!rejectReason.trim()) {
      setQaError('Reject reason is required.')
      return
    }
    setQaError(null)
    rejectMutation.mutate()
  }

  const categoryOptions = categoriesQuery.data?.results ?? []
  const product = productQuery.data

  if (!productId || isHttpNotFound(productQuery.error)) {
    return <NotFoundPage />
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="admin-product-detail-title">
        <p className="admin-page__eyebrow">Administrator</p>
        <h1 id="admin-product-detail-title">Manage product</h1>

        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/console/products">
            Back to products
          </Link>
          <Link
            className="home-page__cta home-page__cta--secondary"
            to="/console/products?status=pending_review"
          >
            QA queue
          </Link>
        </div>

        {productQuery.isLoading ? (
          <Spinner label="Loading product..." />
        ) : productQuery.isError ? (
          <ErrorState
            title="Product not found"
            description="This product could not be loaded."
            action={
              <Button variant="secondary" onClick={() => productQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : product ? (
          <>
            {(product.status === 'pending_review' || product.status === 'rejected') && (
              <div className="admin-create-form" aria-labelledby="admin-product-qa-title">
                <h2 id="admin-product-qa-title">Import QA</h2>
                {qaError ? <Alert variant="error" message={qaError} /> : null}

                {product.status === 'pending_review' ? (
                  <>
                    <p className="home-page__subtitle">
                      This product is pending review. Choose Free or Paid (with its price),
                      then approve to publish it. Reject requires a reason.
                    </p>
                    {product.qa_notes ? (
                      <p className="home-page__subtitle">QA notes: {product.qa_notes}</p>
                    ) : null}
                    <PricingChoice
                      idPrefix="qa"
                      legend="Pricing when published"
                      value={approvePricing}
                      onChange={setApprovePricing}
                      disabled={qaPending}
                    />
                    {approvePricing === 'paid' ? (
                      <FormField id="qa-price" label={`Price (${product.currency})`}>
                        <Input
                          id="qa-price"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={approvePrice}
                          onChange={(event) => setApprovePrice(event.target.value)}
                          disabled={qaPending}
                        />
                      </FormField>
                    ) : null}
                    <div className="dashboard-card__actions">
                      <Button
                        type="button"
                        isLoading={approveMutation.isPending}
                        disabled={qaPending}
                        onClick={onApprove}
                      >
                        {approvePricing === 'free'
                          ? 'Approve & publish as free'
                          : `Approve & publish${
                              Number.parseFloat(approvePrice) > 0
                                ? ` at ${product.currency} ${Number.parseFloat(approvePrice).toFixed(2)}`
                                : ''
                            }`}
                      </Button>
                    </div>
                    {product.reject_reason ? (
                      <p className="home-page__subtitle">
                        Prior reject reason: {product.reject_reason}
                      </p>
                    ) : null}
                    <FormField id="qa-reject-reason" label="Reject reason">
                      <Input
                        id="qa-reject-reason"
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                        disabled={qaPending}
                        autoComplete="off"
                      />
                    </FormField>
                    <FormField id="qa-notes" label="QA notes (optional)">
                      <textarea
                        id="qa-notes"
                        className="ui-input"
                        rows={3}
                        value={qaNotes}
                        onChange={(event) => setQaNotes(event.target.value)}
                        disabled={qaPending}
                      />
                    </FormField>
                    <div className="dashboard-card__actions">
                      <Button
                        type="button"
                        variant="secondary"
                        isLoading={rejectMutation.isPending}
                        disabled={qaPending}
                        onClick={onReject}
                      >
                        Reject
                      </Button>
                    </div>
                  </>
                ) : null}

                {product.status === 'rejected' ? (
                  <>
                    {product.reject_reason ? (
                      <p className="home-page__subtitle">
                        Reject reason: {product.reject_reason}
                      </p>
                    ) : null}
                    {product.qa_notes ? (
                      <p className="home-page__subtitle">QA notes: {product.qa_notes}</p>
                    ) : null}
                    <div className="dashboard-card__actions">
                      <Button
                        type="button"
                        isLoading={requeueMutation.isPending}
                        disabled={qaPending}
                        onClick={() => {
                          setQaError(null)
                          requeueMutation.mutate()
                        }}
                      >
                        Requeue
                      </Button>
                    </div>
                  </>
                ) : null}

                {product.reviewed_at ? (
                  <p className="home-page__subtitle">
                    Reviewed at: {new Date(product.reviewed_at).toLocaleString()}
                    {product.reviewed_by ? ` · Reviewer: ${product.reviewed_by}` : ''}
                  </p>
                ) : null}
              </div>
            )}

            <form className="admin-create-form" onSubmit={onSubmit} noValidate>
              {formError ? <Alert variant="error" message={formError} /> : null}
              <FormField id="detail-category" label="Category">
                <select
                  id="detail-category"
                  className="ui-input"
                  value={form.category_id ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category_id: event.target.value,
                    }))
                  }
                >
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField id="detail-name" label="Name">
                <Input
                  id="detail-name"
                  value={form.name ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </FormField>
              <FormField id="detail-sku" label="SKU / Model ID">
                <Input
                  id="detail-sku"
                  value={form.sku ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      sku: event.target.value || null,
                    }))
                  }
                  placeholder="MDL-000142"
                  autoComplete="off"
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
              <FormField id="detail-import-batch" label="Import batch ID">
                <Input
                  id="detail-import-batch"
                  value={form.import_batch_id ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      import_batch_id: event.target.value,
                    }))
                  }
                  autoComplete="off"
                />
              </FormField>
              <FormField id="detail-glb-checksum" label="GLB checksum (SHA256)">
                <Input
                  id="detail-glb-checksum"
                  value={form.glb_checksum ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      glb_checksum: event.target.value,
                    }))
                  }
                  autoComplete="off"
                />
              </FormField>
              <FormField id="detail-short-description" label="Short description">
                <Input
                  id="detail-short-description"
                  value={form.short_description ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      short_description: event.target.value,
                    }))
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
              <PricingChoice
                idPrefix="detail"
                value={formPricing}
                onChange={(mode) => {
                  setFormPricing(mode)
                  // Switching a free model to Paid starts from an empty price, not 0.00.
                  if (mode === 'paid' && Number(form.price) === 0) {
                    setForm((current) => ({ ...current, price: '' }))
                  }
                }}
              />
              {formPricing === 'paid' ? (
                <>
                  <FormField id="detail-price" label="Price">
                    <Input
                      id="detail-price"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.price ?? ''}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, price: event.target.value }))
                      }
                    />
                  </FormField>
                  <FormField id="detail-discount-price" label="Discount price">
                    <Input
                      id="detail-discount-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.discount_price ?? ''}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          discount_price: event.target.value || null,
                        }))
                      }
                    />
                  </FormField>
                </>
              ) : (
                <p className="home-page__subtitle">
                  Free: customers download it without payment. Saving sets the price to 0.
                </p>
              )}
              <FormField id="detail-currency" label="Currency">
                <Input
                  id="detail-currency"
                  value={form.currency ?? 'USD'}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, currency: event.target.value }))
                  }
                />
              </FormField>
              <FormField id="detail-software" label="Software used">
                <Input
                  id="detail-software"
                  value={form.software_used ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      software_used: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField id="detail-license" label="License type">
                <select
                  id="detail-license"
                  className="ui-input"
                  value={form.license_type ?? 'standard'}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      license_type: event.target.value as ProductLicenseType,
                    }))
                  }
                >
                  <option value="standard">Standard</option>
                  <option value="extended">Extended</option>
                  <option value="editorial">Editorial</option>
                </select>
              </FormField>
              <FormField id="detail-status" label="Status">
                <select
                  id="detail-status"
                  className="ui-input"
                  value={form.status ?? 'draft'}
                  onChange={(event) =>
                    setForm((current) => ({
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
              <div className="admin-filters">
                <label className="ui-input">
                  <input
                    type="checkbox"
                    checked={form.animated ?? false}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        animated: event.target.checked,
                      }))
                    }
                  />{' '}
                  Animated
                </label>
                <label className="ui-input">
                  <input
                    type="checkbox"
                    checked={form.rigged ?? false}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        rigged: event.target.checked,
                      }))
                    }
                  />{' '}
                  Rigged
                </label>
                <label className="ui-input">
                  <input
                    type="checkbox"
                    checked={form.pbr_ready ?? false}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        pbr_ready: event.target.checked,
                      }))
                    }
                  />{' '}
                  PBR ready
                </label>
                <label className="ui-input">
                  <input
                    type="checkbox"
                    checked={form.game_ready ?? false}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        game_ready: event.target.checked,
                      }))
                    }
                  />{' '}
                  Game ready
                </label>
              </div>
              <div className="dashboard-card__actions">
                <Button type="submit" isLoading={saveMutation.isPending}>
                  Save changes
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  isLoading={archiveMutation.isPending}
                  onClick={() => window.confirm('Archive this product? It will be hidden from the storefront.') && archiveMutation.mutate()}
                >
                  Archive
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  isLoading={deleteMutation.isPending}
                  onClick={() =>
                    window.confirm(
                      'Delete this product permanently? If a customer already owns it, it is archived instead so their download keeps working.',
                    ) && deleteMutation.mutate()
                  }
                >
                  Delete
                </Button>
              </div>
            </form>

            <ProductMediaSection productId={productId} product={product} />
          </>
        ) : null}
      </section>
    </main>
  )
}
