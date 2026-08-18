import { isAxiosError } from 'axios'
import { useQuery } from '@tanstack/react-query'
import { useLayoutEffect } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getPublicProduct, listPublicProducts } from '../../api/productsApi'
import { RatingDisplay } from '../../components/reviews/RatingDisplay'
import { ReviewsSection } from '../../components/reviews/ReviewsSection'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import {
  buildProductMetaDescription,
  buildProductPageTitle,
  useDocumentSeo,
} from '../../hooks/useDocumentSeo'
import { getApiErrorMessage } from '../../lib/apiError'
import type { ProductLicenseType, PublicProductDetail } from '../../types/product'
import { ProductCard } from './ProductCard'
import { ProductCtaGroup } from './ProductCtaGroup'
import { ProductImageGallery } from './ProductImageGallery'
import { ProductSpecs } from './ProductSpecs'

const RELATED_PAGE_SIZE = 5

function formatMoney(amount: string, currency: string): string {
  const value = Number(amount)
  if (Number.isNaN(value)) {
    return amount
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function licenseLabel(license: ProductLicenseType): string {
  switch (license) {
    case 'extended':
      return 'Extended'
    case 'editorial':
      return 'Editorial'
    default:
      return 'Standard'
  }
}

function discountPercent(price: string, discountPrice: string): number | null {
  const original = Number(price)
  const discounted = Number(discountPrice)
  if (
    Number.isNaN(original) ||
    Number.isNaN(discounted) ||
    original <= 0 ||
    discounted >= original
  ) {
    return null
  }
  return Math.round(((original - discounted) / original) * 100)
}

function useScrollProductPageToTop(resetKey: string): void {
  useLayoutEffect(() => {
    const historyObj = window.history
    const previousRestoration = historyObj.scrollRestoration
    if (previousRestoration !== undefined) {
      historyObj.scrollRestoration = 'manual'
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    return () => {
      if (previousRestoration !== undefined) {
        historyObj.scrollRestoration = previousRestoration
      }
    }
  }, [resetKey])
}

function ProductDetailSkeleton() {
  return (
    <div className="product-detail-skeleton" aria-label="Loading product details" aria-busy="true">
      <div className="product-detail-skeleton__breadcrumb" />
      <div className="product-detail-skeleton__layout">
        <div className="product-detail-skeleton__gallery" />
        <div className="product-detail-skeleton__info">
          <div className="product-detail-skeleton__line product-detail-skeleton__line--title" />
          <div className="product-detail-skeleton__line product-detail-skeleton__line--short" />
          <div className="product-detail-skeleton__line" />
          <div className="product-detail-skeleton__line product-detail-skeleton__line--medium" />
          <div className="product-detail-skeleton__cta" />
        </div>
      </div>
    </div>
  )
}

function ProductDetailContent({ product }: { product: PublicProductDetail }) {
  const hasDiscount = Boolean(
    product.discount_price && Number(product.discount_price) < Number(product.price),
  )
  const salePercent =
    hasDiscount && product.discount_price
      ? discountPercent(product.price, product.discount_price)
      : null
  const browseCategoryHref = `/products?category=${encodeURIComponent(product.category.id)}`
  const licenses: ProductLicenseType[] = ['standard', 'extended', 'editorial']

  const relatedQuery = useQuery({
    queryKey: ['public-products-related', product.category.id, product.id],
    queryFn: () =>
      listPublicProducts({
        category_id: product.category.id,
        page: 1,
        page_size: RELATED_PAGE_SIZE,
        ordering: '-created_at',
      }),
  })

  const relatedProducts =
    relatedQuery.data?.results.filter((item) => item.id !== product.id).slice(0, 4) ?? []

  return (
    <>
      <div className="product-detail-layout">
        <div className="product-detail-layout__media">
          <nav className="product-detail-breadcrumb" aria-label="Breadcrumb">
            <ol className="product-detail-breadcrumb__list">
              <li>
                <Link to="/">Home</Link>
              </li>
              <li>
                <Link to="/products">3D Models</Link>
              </li>
              <li>
                <Link to={browseCategoryHref}>{product.category.name}</Link>
              </li>
              <li aria-current="page">{product.name}</li>
            </ol>
          </nav>

          <ProductImageGallery
            productName={product.name}
            thumbnail={product.thumbnail}
            images={product.images}
            previewModelUrl={product.preview_model}
          />

          <p className="product-detail-media-note">
            Full package download unlocks after purchase entitlement ships. Preview package URLs are
            never exposed on this page.
          </p>
        </div>

        <aside className="product-detail-purchase" aria-label="Product purchase details">
          <p className="product-detail-purchase__eyebrow">{product.category.name}</p>
          <h1 className="product-detail-purchase__title">{product.name}</h1>

          <div className="product-detail-purchase__meta">
            <span className="product-detail-purchase__rating">
              <RatingDisplay
                averageRating={product.average_rating}
                reviewCount={product.review_count}
                variant="detail"
                className=""
              />
              <span aria-hidden="true"> · </span>
              {product.total_downloads.toLocaleString()} downloads
            </span>
            <span className="product-detail-badge product-detail-badge--available">Available</span>
          </div>

          <div className="product-detail-purchase__price">
            {hasDiscount && product.discount_price ? (
              <>
                <span className="product-detail-purchase__price-current">
                  {formatMoney(product.discount_price, product.currency)}
                </span>
                <span className="product-detail-purchase__price-original">
                  {formatMoney(product.price, product.currency)}
                </span>
                {salePercent !== null ? (
                  <span className="product-detail-badge product-detail-badge--sale">
                    -{salePercent}%
                  </span>
                ) : (
                  <span className="product-detail-badge product-detail-badge--sale">Sale</span>
                )}
              </>
            ) : (
              <span className="product-detail-purchase__price-current">
                {formatMoney(product.price, product.currency)}
              </span>
            )}
          </div>
          <p className="product-detail-purchase__price-note">
            Price includes {licenseLabel(product.license_type).toLowerCase()} license ·{' '}
            {product.currency}
          </p>

          {product.short_description.trim() ? (
            <p className="product-detail-purchase__summary">{product.short_description}</p>
          ) : null}

          <div className="product-detail-license" role="group" aria-label="License type">
            {licenses.map((license) => {
              const selected = product.license_type === license
              return (
                <span
                  key={license}
                  className={`product-detail-license__option${
                    selected ? ' product-detail-license__option--selected' : ''
                  }`}
                  aria-current={selected ? 'true' : undefined}
                >
                  {licenseLabel(license)}
                  {selected ? ` · ${formatMoney(
                    hasDiscount && product.discount_price
                      ? product.discount_price
                      : product.price,
                    product.currency,
                  )}` : null}
                </span>
              )
            })}
          </div>

          <ProductCtaGroup
            productId={product.id}
            productName={product.name}
            productSlug={product.slug}
          />
          <ProductSpecs product={product} />
        </aside>
      </div>

      <section
        className="product-detail-description"
        aria-labelledby="product-description-heading"
      >
        <h2 id="product-description-heading" className="product-detail-section-title">
          Description
        </h2>
        {product.description.trim() ? (
          <p className="product-detail-description__body">{product.description}</p>
        ) : (
          <p className="product-detail-description__body product-detail-description__body--empty">
            No full description provided for this product.
          </p>
        )}
      </section>

      <ReviewsSection
        productType="product"
        productId={product.id}
        catalogSlug={product.slug}
        averageRating={product.average_rating}
        reviewCount={product.review_count}
      />

      <section className="product-detail-related" aria-labelledby="product-related-heading">
        <div className="product-detail-related__header">
          <h2 id="product-related-heading" className="product-detail-section-title">
            Similar products
          </h2>
          <Link to={browseCategoryHref} className="product-detail-related__browse">
            Browse {product.category.name}
          </Link>
        </div>

        {relatedQuery.isLoading ? (
          <div
            className="products-grid products-grid--skeleton"
            aria-label="Loading similar products"
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="product-card-skeleton">
                <div className="product-card-skeleton__media" />
                <div className="product-card-skeleton__body">
                  <div className="product-card-skeleton__line product-card-skeleton__line--short" />
                  <div className="product-card-skeleton__line" />
                </div>
              </div>
            ))}
          </div>
        ) : relatedQuery.isError ? (
          <ErrorState
            title="Could not load similar products"
            description="Try refreshing this section."
            action={
              <Button variant="secondary" onClick={() => relatedQuery.refetch()}>
                Try again
              </Button>
            }
          />
        ) : relatedProducts.length === 0 ? (
          <EmptyState
            title="No similar products yet"
            description={`There are no other published products in ${product.category.name} right now.`}
            action={
              <Link to="/products" className="ui-button ui-button--secondary">
                Browse all products
              </Link>
            }
          />
        ) : (
          <div className="products-grid">
            {relatedProducts.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}

export function ProductDetailsPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const trimmedSlug = slug.trim()

  const productQuery = useQuery({
    queryKey: ['public-product-detail', trimmedSlug],
    queryFn: () => getPublicProduct(trimmedSlug),
    enabled: Boolean(trimmedSlug),
  })

  useScrollProductPageToTop(`${trimmedSlug}:${productQuery.data?.id ?? 'pending'}`)

  const isNotFound =
    !trimmedSlug ||
    (isAxiosError(productQuery.error) && productQuery.error.response?.status === 404)

  useDocumentSeo({
    title: isNotFound
      ? 'Product not found | 3D Asset Marketplace'
      : productQuery.data
        ? buildProductPageTitle(productQuery.data.name)
        : 'Product details | 3D Asset Marketplace',
    description: isNotFound
      ? 'The requested product could not be found.'
      : productQuery.data
        ? buildProductMetaDescription(
            productQuery.data.name,
            productQuery.data.short_description,
          )
        : 'Loading product details from the marketplace catalog.',
  })

  return (
    <main className="product-detail-page">
      {!trimmedSlug || isNotFound ? (
        <EmptyState
          title="Product not found"
          description="This product is unavailable, unpublished, or the link may be incorrect."
          action={
            <Link to="/products" className="ui-button ui-button--primary">
              Back to products
            </Link>
          }
        />
      ) : productQuery.isLoading ? (
        <ProductDetailSkeleton />
      ) : productQuery.isError || !productQuery.data ? (
        <ErrorState
          title="Failed to load product"
          description={getApiErrorMessage(
            productQuery.error,
            'We could not load this product. Please try again.',
          )}
          action={
            <Button variant="secondary" onClick={() => productQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <ProductDetailContent product={productQuery.data} />
      )}
    </main>
  )
}
