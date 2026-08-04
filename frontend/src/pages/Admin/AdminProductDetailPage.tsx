import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { listAdminCategories } from '../../api/categoriesApi'
import {
  archiveAdminProduct,
  getAdminProduct,
  updateAdminProduct,
} from '../../api/productsApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type {
  AdminProductUpdatePayload,
  ProductLicenseType,
  ProductStatus,
} from '../../types/product'
import { ProductMediaSection } from './ProductMediaSection'

export function AdminProductDetailPage() {
  const { productId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AdminProductUpdatePayload>({})
  const [formError, setFormError] = useState<string | null>(null)

  const productQuery = useQuery({
    queryKey: ['admin', 'products', productId],
    queryFn: () => getAdminProduct(productId),
    enabled: Boolean(productId),
  })

  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories', 'product-form'],
    queryFn: () => listAdminCategories({ is_active: true, page_size: 100 }),
  })

  useEffect(() => {
    if (!productQuery.data) {
      return
    }
    const product = productQuery.data
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
  }, [productQuery.data])

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
      navigate('/admin', { replace: true })
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
      navigate('/admin', { replace: true })
    },
    onError: (error) => {
      setFormError(getApiErrorMessage(error, 'Could not archive product.'))
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    saveMutation.mutate(form)
  }

  const categoryOptions = categoriesQuery.data?.results ?? []
  const product = productQuery.data

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="admin-product-detail-title">
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="admin-product-detail-title">Manage product</h1>

        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/admin/products">
            Back to products
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
              <FormField id="detail-price" label="Price">
                <Input
                  id="detail-price"
                  type="number"
                  min="0"
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
                  <option value="published">Published</option>
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
                  onClick={() => archiveMutation.mutate()}
                >
                  Archive
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
