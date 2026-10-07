import { useQuery } from '@tanstack/react-query'
import { useLayoutEffect } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getPublicPlugin, listPublicPlugins } from '../../api/pluginsApi'
import { RatingDisplay } from '../../components/reviews/RatingDisplay'
import { ReviewsSection } from '../../components/reviews/ReviewsSection'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { WishlistToggle } from '../../components/wishlist/WishlistToggle'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { getApiErrorMessage, isHttpNotFound } from '../../lib/apiError'
import { formatMoney } from '../../lib/format'
import { discountPercent } from '../../lib/pricing'
import { NotFoundPage } from '../NotFound/NotFoundPage'
import type { PluginLicenseType, PublicPluginDetail } from '../../types/plugin'
import { ProductImageGallery } from '../Products/ProductImageGallery'
import { PluginCard } from './PluginCard'
import { PluginCtaGroup } from './PluginCtaGroup'
import { PluginSpecs } from './PluginSpecs'
import '../../styles/product-details.css'
import '../../styles/product-hub-details.css'
import '../../styles/plugins-browse.css'
import '../../styles/products-browse.css'

const RELATED_PAGE_SIZE = 5

function licenseLabel(license: PluginLicenseType): string {
  switch (license) {
    case 'extended':
      return 'Extended'
    case 'commercial':
      return 'Commercial'
    default:
      return 'Standard'
  }
}

function buildPluginPageTitle(pluginName: string): string {
  return `${pluginName} | 3D Asset Marketplace`
}

function buildPluginMetaDescription(pluginName: string, shortDescription: string): string {
  const trimmed = shortDescription.trim()
  if (trimmed) {
    return trimmed.slice(0, 160)
  }
  return `View details for ${pluginName} on 3D Asset Marketplace.`
}

function useScrollPluginPageToTop(resetKey: string): void {
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [resetKey])
}

function PluginDetailSkeleton() {
  return (
    <div className="product-detail-skeleton" aria-label="Loading plugin details" aria-busy="true">
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

function PluginDetailContent({ plugin }: { plugin: PublicPluginDetail }) {
  const hasDiscount = Boolean(
    plugin.discount_price && Number(plugin.discount_price) < Number(plugin.price),
  )
  const salePercent =
    hasDiscount && plugin.discount_price
      ? discountPercent(plugin.price, plugin.discount_price)
      : null
  const browseCategoryHref = `/plugins?category=${encodeURIComponent(plugin.category.id)}`

  const relatedQuery = useQuery({
    queryKey: ['public-plugins-related', plugin.category.id, plugin.id],
    queryFn: () =>
      listPublicPlugins({
        category_id: plugin.category.id,
        page: 1,
        page_size: RELATED_PAGE_SIZE,
        ordering: '-created_at',
      }),
  })

  const relatedPlugins =
    relatedQuery.data?.results.filter((item) => item.id !== plugin.id).slice(0, 4) ?? []

  return (
    <>
      <header className="product-hub-detail__header">
        <div className="product-hub-detail__header-text">
          <p className="product-hub-detail__eyebrow">{plugin.category.name}</p>
          <h1 className="product-hub-detail__title">{plugin.name}</h1>
          <div className="product-hub-detail__meta">
            <RatingDisplay
              averageRating={plugin.average_rating}
              reviewCount={plugin.review_count}
              variant="detail"
              className=""
            />
          </div>
        </div>
        <Link to="/plugins" className="product-hub-detail__close" aria-label="Close">
          ✕ Close
        </Link>
      </header>

      <div className="product-detail-layout product-hub-detail__layout">
        <div className="product-detail-layout__media">
          <ProductImageGallery
            productName={plugin.name}
            thumbnail={plugin.thumbnail}
            images={plugin.images}
            previewModelUrl=""
            showStageChrome
            showPreviewModeThumbs={false}
            stageOverlays={
              <WishlistToggle
                productType="plugin"
                productId={plugin.id}
                productName={plugin.name}
                variant="icon"
              />
            }
          />
        </div>

        <aside className="product-hub-detail__aside" aria-label="Plugin purchase details">
          <PluginSpecs plugin={plugin} />

          <div className="product-hub-detail__purchase">
            <div className="product-hub-detail__purchase-row">
              <div className="product-hub-detail__purchase-info">
                <div className="product-detail-purchase__price">
                  {hasDiscount && plugin.discount_price ? (
                    <>
                      <span className="product-detail-purchase__price-current">
                        {formatMoney(plugin.discount_price, plugin.currency)}
                      </span>
                      <span className="product-detail-purchase__price-original">
                        {formatMoney(plugin.price, plugin.currency)}
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
                      {formatMoney(plugin.price, plugin.currency)}
                    </span>
                  )}
                </div>

                <p className="product-hub-detail__license">
                  <span className="product-hub-detail__license-check" aria-hidden="true">
                    ✓
                  </span>
                  {licenseLabel(plugin.license_type)} License
                </p>
              </div>

              <PluginCtaGroup
                pluginId={plugin.id}
                pluginName={plugin.name}
                pluginSlug={plugin.slug}
              />
            </div>

            {plugin.short_description.trim() ? (
              <p className="product-detail-purchase__summary">{plugin.short_description}</p>
            ) : null}

            {plugin.documentation_url.trim() ? (
              <a
                href={plugin.documentation_url}
                target="_blank"
                rel="noopener noreferrer"
                className="product-hub-detail__docs-link"
              >
                View documentation
              </a>
            ) : null}
          </div>
        </aside>
      </div>

      <ReviewsSection
        productType="plugin"
        productId={plugin.id}
        catalogSlug={plugin.slug}
        averageRating={plugin.average_rating}
        reviewCount={plugin.review_count}
        layout="hub"
      />

      <section className="product-detail-related" aria-labelledby="plugin-related-heading">
        <div className="product-detail-related__header">
          <h2 id="plugin-related-heading" className="product-detail-section-title">
            Similar plugins
          </h2>
          <Link to={browseCategoryHref} className="product-detail-related__browse">
            Browse {plugin.category.name}
          </Link>
        </div>

        {relatedQuery.isLoading ? (
          <div
            className="products-grid products-grid--skeleton"
            aria-label="Loading similar plugins"
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
            title="Could not load similar plugins"
            description="Try refreshing this section."
            action={
              <Button variant="secondary" onClick={() => relatedQuery.refetch()}>
                Try again
              </Button>
            }
          />
        ) : relatedPlugins.length === 0 ? (
          <EmptyState
            title="No similar plugins yet"
            description={`There are no other published plugins in ${plugin.category.name} right now.`}
            action={
              <Link to="/plugins" className="ui-button ui-button--secondary">
                Browse all plugins
              </Link>
            }
          />
        ) : (
          <div className="products-grid">
            {relatedPlugins.map((item) => (
              <PluginCard key={item.id} plugin={item} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}

export function PluginDetailsPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const trimmedSlug = slug.trim()

  const pluginQuery = useQuery({
    queryKey: ['public-plugin-detail', trimmedSlug],
    queryFn: () => getPublicPlugin(trimmedSlug),
    enabled: Boolean(trimmedSlug),
  })

  useScrollPluginPageToTop(`${trimmedSlug}:${pluginQuery.data?.id ?? 'pending'}`)

  const isNotFound = !trimmedSlug || isHttpNotFound(pluginQuery.error)

  useDocumentSeo({
    title: isNotFound
      ? 'Plugin not found | 3D Asset Marketplace'
      : pluginQuery.data
        ? buildPluginPageTitle(pluginQuery.data.name)
        : 'Plugin details | 3D Asset Marketplace',
    description: isNotFound
      ? 'The requested plugin could not be found.'
      : pluginQuery.data
        ? buildPluginMetaDescription(
          pluginQuery.data.name,
          pluginQuery.data.short_description,
        )
        : 'Loading plugin details from the marketplace catalog.',
  })

  if (isNotFound) {
    return <NotFoundPage />
  }

  return (
    <main className="product-detail-page product-hub-detail">
      {pluginQuery.isLoading ? (
        <PluginDetailSkeleton />
      ) : pluginQuery.isError || !pluginQuery.data ? (
        <ErrorState
          title="Failed to load plugin"
          description={getApiErrorMessage(
            pluginQuery.error,
            'We could not load this plugin. Please try again.',
          )}
          action={
            <Button variant="secondary" onClick={() => pluginQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <PluginDetailContent plugin={pluginQuery.data} />
      )}
    </main>
  )
}
