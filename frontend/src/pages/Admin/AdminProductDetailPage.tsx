import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
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
import { isLocalInputInPast, localInputToUtc, utcToLocalInput } from '../../lib/saleEnd'
import { PRODUCT_ARCHIVE_CONFIRMATION, PRODUCT_ARCHIVE_SUCCESS } from '../../lib/productArchive'
import type {
  AdminProductUpdatePayload,
  ProductLicenseType,
  ProductStatus,
} from '../../types/product'
import { isFreeProduct, isLiveUpdate, productStatusLabel } from '../../types/product'
import { PricingChoice } from './PricingChoice'
import type { PricingMode } from './PricingChoice'
import { ProductFileCheckPanel } from './ProductFileCheckPanel'
import { ProductPriceHistoryPanel } from './ProductPriceHistoryPanel'
import { ProductMediaSection } from './ProductMediaSection'
import { NotFoundPage } from '../NotFound/NotFoundPage'
import '../../styles/admin-product-detail.css'

export const SALE_END_PAST_MESSAGE = 'Sale end must be in the future.'

export function AdminProductDetailPage() {
  const { productId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AdminProductUpdatePayload>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [qaNotes, setQaNotes] = useState('')
  const [qaError, setQaError] = useState<string | null>(null)
  const [saleEndLocal, setSaleEndLocal] = useState('')
  const [formPricing, setFormPricing] = useState<PricingMode>('paid')
  // Gallery images whose file did not load in this browser (shown in the file check).
  const [failedImageIds, setFailedImageIds] = useState<ReadonlySet<string>>(() => new Set())
  const markImageFailed = useCallback((imageId: string) => {
    setFailedImageIds((current) => (current.has(imageId) ? current : new Set(current).add(imageId)))
  }, [])

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
    // An ended sale loads as "no sale": saving the form must never start it again.
    const saleEnded = Boolean(product.discount_price) && product.discount_active === false
    setSaleEndLocal(saleEnded ? '' : utcToLocalInput(product.discount_ends_at))
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
      discount_price: saleEnded ? null : product.discount_price,
      thumbnail: product.thumbnail,
      preview_model: product.preview_model,
      preview_video: product.preview_video,
      polygon_count: product.polygon_count,
      vertex_count: product.vertex_count,
      software_used: product.software_used,
      pbr_ready: product.pbr_ready,
      game_ready: product.game_ready,
      license_type: product.license_type,
      status: product.status,
    })
  }, [productQuery.data, hydratedProductId])

  const invalidateProduct = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'products', productId] })
    await queryClient.invalidateQueries({ predicate: (query) =>
      typeof query.queryKey[0] === 'string' && /^public-(models|products|product)(-|$)/.test(query.queryKey[0]),
    })
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
      toast.success(PRODUCT_ARCHIVE_SUCCESS)
      await invalidateProduct()
      navigate('/console/archived', { replace: true })
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not archive product.'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => bulkDeleteAdminProducts([productId]),
    onSuccess: async (result) => {
      if (!result.archived.includes(productId)) {
        setFormError('Product was not found. Refresh the product list and try again.')
        return
      }
      toast.success(PRODUCT_ARCHIVE_SUCCESS)
      await invalidateProduct()
      navigate('/console/products', { replace: true })
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not delete product.'))
    },
  })

  // A live model uploaded again: still on sale, waiting for review.
  const liveUpdate = productQuery.data ? isLiveUpdate(productQuery.data) : false
  // Only a model with upload_kind "free" is free; anything else goes on to the Pricing page.
  const isPaidUpload = productQuery.data?.upload_kind !== 'free'

  const approveMutation = useMutation({
    mutationFn: () => approveAdminProduct(productId),
    onSuccess: async () => {
      toast.success(
        liveUpdate
          ? 'Update approved; the model stays on sale'
          : isPaidUpload
            ? 'Approved. The model now waits on the Pricing page.'
            : 'Published as a free download',
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
      toast.success(liveUpdate ? 'Update rejected; the model is off the store' : 'Product rejected')
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

  // QA never sets a price: the body is empty and the server decides the next status.
  const onApprove = () => {
    setQaError(null)
    approveMutation.mutate()
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    // The status is sent only when the administrator changed it here. QA actions change it
    // on the server while this form keeps its first value, which must not undo them.
    const current = productQuery.data
    const { status, discount_ends_at: _loadedEnd, ...rest } = form
    const base: AdminProductUpdatePayload =
      status !== undefined && current !== undefined && status !== current.status
        ? { ...rest, status }
        : rest
    if (formPricing === 'free') {
      saveMutation.mutate({ ...base, price: '0.00', discount_price: null, discount_ends_at: null })
      return
    }
    const price = Number.parseFloat(String(form.price ?? ''))
    if (!Number.isFinite(price) || price <= 0) {
      setFormError('Enter a price above 0, or choose Free.')
      return
    }
    const hasSale = Boolean(form.discount_price)
    if (hasSale && saleEndLocal && isLocalInputInPast(saleEndLocal)) {
      setFormError(SALE_END_PAST_MESSAGE)
      return
    }
    // Send the sale end only when it changed: the date field has no seconds, so resending an
    // unchanged end would move it and write a needless price-history row.
    const loadedEndLocal = current?.discount_active ? utcToLocalInput(current.discount_ends_at) : ''
    if (!hasSale) {
      saveMutation.mutate({ ...base, discount_ends_at: null })
    } else if (saleEndLocal !== loadedEndLocal || !current?.discount_active) {
      saveMutation.mutate({ ...base, discount_ends_at: localInputToUtc(saleEndLocal) })
    } else {
      saveMutation.mutate(base)
    }
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
  // Same names as the server's file check: "Primary image", or "Image <position>".
  const failedImageLabels =
    product?.images.flatMap((image, index) =>
      failedImageIds.has(image.id) ? [image.is_primary ? 'Primary image' : `Image ${index + 1}`] : [],
    ) ?? []

  if (!productId || isHttpNotFound(productQuery.error)) {
    return <NotFoundPage />
  }

  // Shared by a new model's review and a live model's update.
  const rejectControls = (
    <>
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
          {liveUpdate ? 'Reject and take off the store' : 'Reject'}
        </Button>
      </div>
    </>
  )

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="admin-product-detail-title">
        <p className="admin-page__eyebrow">Administrator</p>
        <h1 id="admin-product-detail-title">Manage product</h1>

        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to={product?.status === 'archived' ? '/console/archived' : '/console/products'}>
            {product?.status === 'archived' ? 'Back to archived products' : 'Back to products'}
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
            {(product.status === 'pending_review' ||
              product.status === 'awaiting_price' ||
              product.status === 'rejected' ||
              liveUpdate) && (
              <div className="admin-create-form" aria-labelledby="admin-product-qa-title">
                <h2 id="admin-product-qa-title">
                  {liveUpdate ? (
                    <>
                      Import QA <span className="admin-live-update-badge">Update to a live model</span>
                    </>
                  ) : (
                    'Import QA'
                  )}
                </h2>
                {qaError ? <Alert variant="error" message={qaError} /> : null}

                {liveUpdate ? (
                  <>
                    <p className="home-page__subtitle">
                      This model is on sale and was uploaded again. The store already shows the
                      new files (renders, preview, download); its text and price are unchanged.
                      Check the files, then approve to keep it on sale, or reject to take it off
                      the store. Buyers keep their downloads either way.
                    </p>
                    {product.qa_notes ? (
                      <p className="home-page__subtitle">QA notes: {product.qa_notes}</p>
                    ) : null}
                    <div className="dashboard-card__actions">
                      <Button
                        type="button"
                        isLoading={approveMutation.isPending}
                        disabled={qaPending}
                        onClick={onApprove}
                      >
                        Approve update
                      </Button>
                    </div>
                    {rejectControls}
                  </>
                ) : null}

                {product.status === 'pending_review' ? (
                  <>
                    <p className="home-page__subtitle">
                      This product is pending review.{' '}
                      {isPaidUpload
                        ? 'Check the quality, then approve to send it to the Pricing page.'
                        : 'Approve to publish it as a free download.'}{' '}
                      Reject requires a reason.
                    </p>
                    <p className="home-page__subtitle">
                      <strong>{isPaidUpload ? 'Paid' : 'Free'}</strong>
                    </p>
                    {isPaidUpload ? (
                      <p className="home-page__subtitle">
                        Suggested price (from the upload sheet): {product.currency} {product.price}
                      </p>
                    ) : null}
                    {product.qa_notes ? (
                      <p className="home-page__subtitle">QA notes: {product.qa_notes}</p>
                    ) : null}
                    <div className="dashboard-card__actions">
                      <Button
                        type="button"
                        isLoading={approveMutation.isPending}
                        disabled={qaPending}
                        onClick={onApprove}
                      >
                        {isPaidUpload ? 'Approve quality → send to Pricing' : 'Publish as free'}
                      </Button>
                    </div>
                    {product.reject_reason ? (
                      <p className="home-page__subtitle">
                        Prior reject reason: {product.reject_reason}
                      </p>
                    ) : null}
                    {rejectControls}
                  </>
                ) : null}

                {product.status === 'awaiting_price' ? (
                  <>
                    <p className="home-page__subtitle">
                      Waiting for price. Set the price on the{' '}
                      <Link to="/console/pricing">Pricing page</Link>.
                    </p>
                    {rejectControls}
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

            <ProductFileCheckPanel productId={productId} failedImageLabels={failedImageLabels} />
            <ProductPriceHistoryPanel productId={productId} />

            <form className="admin-create-form admin-product-form" onSubmit={onSubmit} noValidate>
              {formError ? <Alert variant="error" message={formError} /> : null}

              <section className="admin-product-form__section" aria-labelledby="admin-product-details-title">
                <h2 id="admin-product-details-title" className="admin-product-form__title">
                  Product details
                </h2>
                <div className="admin-product-form__grid">
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
                  <FormField
                    id="detail-short-description"
                    label="Short description"
                    className="admin-product-form__full"
                  >
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
                  <FormField id="detail-description" label="Description" className="admin-product-form__full">
                    <textarea
                      id="detail-description"
                      className="ui-input admin-product-form__textarea"
                      rows={6}
                      value={form.description ?? ''}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </FormField>
                </div>
              </section>

              <section className="admin-product-form__section" aria-labelledby="admin-product-pricing-title">
                <h2 id="admin-product-pricing-title" className="admin-product-form__title">
                  Pricing
                </h2>
                <div className="admin-product-form__grid">
                  {product.upload_kind === 'paid' && !isFreeProduct(product) ? (
                    // A paid upload's zip is private: it cannot be made free here.
                    <p className="admin-product-form__full home-page__subtitle admin-product-form__note">
                      Paid upload. To make it free, upload it again with the Free tick.
                    </p>
                  ) : (
                    <div className="admin-product-form__full admin-product-form__choice">
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
                    </div>
                  )}
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
                          onChange={(event) => {
                            const value = event.target.value
                            setForm((current) => ({
                              ...current,
                              discount_price: value || null,
                            }))
                            // No sale price, no end date.
                            if (!value) setSaleEndLocal('')
                          }}
                        />
                      </FormField>
                      {form.discount_price ? (
                        <FormField id="detail-discount-ends-at" label="Sale ends (your local time)">
                          <Input
                            id="detail-discount-ends-at"
                            type="datetime-local"
                            value={saleEndLocal}
                            onChange={(event) => setSaleEndLocal(event.target.value)}
                          />
                        </FormField>
                      ) : null}
                      {product.discount_price && product.discount_active === false ? (
                        <p className="home-page__subtitle admin-product-form__note">Sale ended</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="home-page__subtitle admin-product-form__note">
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
                </div>
              </section>

              <section className="admin-product-form__section" aria-labelledby="admin-product-settings-title">
                <h2 id="admin-product-settings-title" className="admin-product-form__title">
                  Settings
                </h2>
                <div className="admin-product-form__grid">
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
                      {/* Published and Waiting for price are set by QA and the Pricing page only;
                          shown (read-only) when the model already has that status. */}
                      {form.status === 'published' || form.status === 'awaiting_price' ? (
                        <option value={form.status} disabled>
                          {productStatusLabel(form.status)}
                        </option>
                      ) : null}
                      <option value="draft">Draft</option>
                      <option value="pending_review">Pending review</option>
                      <option value="rejected">Rejected</option>
                      <option value="archived">Archived</option>
                    </select>
                  </FormField>
                  <fieldset className="admin-product-form__full admin-product-form__flags">
                    <legend className="form-field__label">Model features</legend>
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
                  </fieldset>
                </div>
              </section>

              <div className="dashboard-card__actions admin-product-form__actions">
                <Button type="submit" isLoading={saveMutation.isPending}>
                  Save changes
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  isLoading={archiveMutation.isPending}
                  disabled={product.status === 'archived' || deleteMutation.isPending}
                  onClick={() => window.confirm(PRODUCT_ARCHIVE_CONFIRMATION) && archiveMutation.mutate()}
                >
                  {product.status === 'archived' ? 'Archived' : 'Archive'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  isLoading={deleteMutation.isPending}
                  disabled={product.status === 'archived' || archiveMutation.isPending}
                  onClick={() =>
                    window.confirm(
                      PRODUCT_ARCHIVE_CONFIRMATION,
                    ) && deleteMutation.mutate()
                  }
                >
                  Delete
                </Button>
              </div>
            </form>

            <ProductMediaSection
              productId={productId}
              product={product}
              failedImageIds={failedImageIds}
              onImageLoadError={markImageFailed}
            />
          </>
        ) : null}
      </section>
    </main>
  )
}
