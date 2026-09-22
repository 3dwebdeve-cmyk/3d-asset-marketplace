import { useQuery } from '@tanstack/react-query'
import { useLayoutEffect } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getPublicProduct, listPublicProducts } from '../../api/productsApi'
import { RatingDisplay } from '../../components/reviews/RatingDisplay'
import { ReviewsSection } from '../../components/reviews/ReviewsSection'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { WishlistToggle } from '../../components/wishlist/WishlistToggle'
import {
  buildProductMetaDescription,
  buildProductPageTitle,
  useDocumentSeo,
} from '../../hooks/useDocumentSeo'
import { getApiErrorMessage, isHttpNotFound } from '../../lib/apiError'
import { formatMoney } from '../../lib/format'
import { discountPercent } from '../../lib/pricing'
import { NotFoundPage } from '../NotFound/NotFoundPage'
import type { ProductLicenseType, PublicProductDetail } from '../../types/product'
import { ProductCard } from './ProductCard'
import { ProductCtaGroup } from './ProductCtaGroup'
import { ProductImageGallery } from './ProductImageGallery'
import { ProductSpecs } from './ProductSpecs'
import '../../styles/product-details.css'
import '../../styles/product-hub-details.css'

const RELATED_PAGE_SIZE = 5

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

function useScrollProductPageToTop(resetKey: string): void {
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [resetKey])
}

function ProductDetailSkeleton() {
  return (
    <div className="product-detail-skeleton" aria-label="Loading product details" aria-busy="true">
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
  const browseCategoryHref = `/3d-models?category=${encodeURIComponent(product.category.id)}`

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
      <header className="product-hub-detail__header">
        <div className="product-hub-detail__header-text">
          <p className="product-hub-detail__eyebrow">{product.category.name}</p>
          <h1 className="product-hub-detail__title">{product.name}</h1>
          <div className="product-hub-detail__meta">
            <RatingDisplay
              averageRating={product.average_rating}
              reviewCount={product.review_count}
              variant="detail"
              className=""
            />
          </div>
        </div>
        <Link to="/3d-models" className="product-hub-detail__close">
          ✕ Close
        </Link>
      </header>

      <div className="product-detail-layout product-hub-detail__layout">
        <div className="product-detail-layout__media">
          <ProductImageGallery
            productName={product.name}
            thumbnail={product.thumbnail}
            images={product.images}
            previewModelUrl={product.preview_model}
            previewVideoUrl={product.preview_video}
            showStageChrome
            showPreviewModeThumbs={false}
            stageOverlays={
              <WishlistToggle
                productType="product"
                productId={product.id}
                productName={product.name}
                variant="icon"
              />
            }
          />

          <p className="product-detail-media-note">
            Full package download unlocks after purchase entitlement ships. Preview package URLs are
            never exposed on this page.
          </p>
        </div>

        <aside className="product-hub-detail__aside" aria-label="Product purchase details">
          <ProductSpecs product={product} />

          <div className="product-hub-detail__purchase">
            <div className="product-hub-detail__purchase-row">
              <div className="product-hub-detail__purchase-info">
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

                <p className="product-hub-detail__license">
                  <span className="product-hub-detail__license-check" aria-hidden="true">
                    ✓
                  </span>
                  {licenseLabel(product.license_type)} License
                </p>
              </div>

              <ProductCtaGroup
                productId={product.id}
                productName={product.name}
                productSlug={product.slug}
              />
            </div>

            {product.short_description.trim() ? (
              <p className="product-detail-purchase__summary">{product.short_description}</p>
            ) : null}
          </div>
        </aside>
      </div>

      <ReviewsSection
        productType="product"
        productId={product.id}
        catalogSlug={product.slug}
        averageRating={product.average_rating}
        reviewCount={product.review_count}
        layout="hub"
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
              <Link to="/3d-models" className="ui-button ui-button--secondary">
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

  const isNotFound = !trimmedSlug || isHttpNotFound(productQuery.error)

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

  if (isNotFound) {
    return <NotFoundPage />
  }

  return (
    <main className="product-detail-page product-hub-detail">
      {productQuery.isLoading ? (
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
