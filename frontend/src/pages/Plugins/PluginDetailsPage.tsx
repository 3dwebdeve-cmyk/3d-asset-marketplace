import { isAxiosError } from 'axios'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { getPublicPlugin, listPublicPlugins } from '../../api/pluginsApi'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { getApiErrorMessage } from '../../lib/apiError'
import type { PluginLicenseType, PublicPluginDetail } from '../../types/plugin'
import { PluginCard } from './PluginCard'
import { PluginCtaGroup } from './PluginCtaGroup'
import { PluginSpecs } from './PluginSpecs'
import { ProductImageGallery } from '../Products/ProductImageGallery'

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

function PluginDetailSkeleton() {
  return (
    <div className="product-detail-skeleton" aria-label="Loading plugin details" aria-busy="true">
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

function PluginDetailContent({ plugin }: { plugin: PublicPluginDetail }) {
  const hasDiscount = Boolean(
    plugin.discount_price && Number(plugin.discount_price) < Number(plugin.price),
  )
  const salePercent =
    hasDiscount && plugin.discount_price
      ? discountPercent(plugin.price, plugin.discount_price)
      : null
  const browseCategoryHref = `/plugins?category=${encodeURIComponent(plugin.category.id)}`
  const rating = Number(plugin.average_rating)
  const licenses: PluginLicenseType[] = ['standard', 'extended', 'commercial']

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
      <div className="product-detail-layout">
        <div className="product-detail-layout__media">
          <nav className="product-detail-breadcrumb" aria-label="Breadcrumb">
            <ol className="product-detail-breadcrumb__list">
              <li>
                <Link to="/">Home</Link>
              </li>
              <li>
                <Link to="/plugins">Plugins</Link>
              </li>
              <li>
                <Link to={browseCategoryHref}>{plugin.category.name}</Link>
              </li>
              <li aria-current="page">{plugin.name}</li>
            </ol>
          </nav>

          <ProductImageGallery
            productName={plugin.name}
            thumbnail={plugin.thumbnail}
            images={plugin.images}
            previewModelUrl=""
          />

          <p className="product-detail-media-note">
            Full package download unlocks after purchase. Package file URLs are never exposed on
            this page.
          </p>
        </div>

        <aside className="product-detail-purchase" aria-label="Plugin purchase details">
          <p className="product-detail-purchase__eyebrow">{plugin.category.name}</p>
          <h1 className="product-detail-purchase__title">{plugin.name}</h1>

          <div className="product-detail-purchase__meta">
            <span className="product-detail-purchase__rating">
              {rating > 0 ? `${rating.toFixed(1)} rating` : 'New plugin'}
              <span aria-hidden="true"> · </span>
              {plugin.total_downloads.toLocaleString()} downloads
            </span>
            <span className="product-detail-badge product-detail-badge--available">
              v{plugin.version}
            </span>
          </div>

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
          <p className="product-detail-purchase__price-note">
            Price includes {licenseLabel(plugin.license_type).toLowerCase()} license ·{' '}
            {plugin.currency}
          </p>

          {plugin.short_description.trim() ? (
            <p className="product-detail-purchase__summary">{plugin.short_description}</p>
          ) : null}

          <div className="product-detail-license" role="group" aria-label="License type">
            {licenses.map((license) => {
              const selected = plugin.license_type === license
              return (
                <span
                  key={license}
                  className={`product-detail-license__option${
                    selected ? ' product-detail-license__option--selected' : ''
                  }`}
                  aria-current={selected ? 'true' : undefined}
                >
                  {licenseLabel(license)}
                  {selected
                    ? ` · ${formatMoney(
                        hasDiscount && plugin.discount_price
                          ? plugin.discount_price
                          : plugin.price,
                        plugin.currency,
                      )}`
                    : null}
                </span>
              )
            })}
          </div>

          <PluginCtaGroup pluginName={plugin.name} pluginSlug={plugin.slug} />
          <PluginSpecs plugin={plugin} />
        </aside>
      </div>

      <section
        className="product-detail-description"
        aria-labelledby="plugin-description-heading"
      >
        <h2 id="plugin-description-heading" className="product-detail-section-title">
          Description
        </h2>
        {plugin.description.trim() ? (
          <p className="product-detail-description__body">{plugin.description}</p>
        ) : (
          <p className="product-detail-description__body product-detail-description__body--empty">
            No full description provided for this plugin.
          </p>
        )}
      </section>

      {plugin.compatibility.trim() ? (
        <section
          className="product-detail-description"
          aria-labelledby="plugin-compat-heading"
        >
          <h2 id="plugin-compat-heading" className="product-detail-section-title">
            Compatible software
          </h2>
          <p className="product-detail-description__body">{plugin.compatibility}</p>
        </section>
      ) : null}

      {plugin.documentation_url.trim() ? (
        <section
          className="product-detail-description"
          aria-labelledby="plugin-docs-heading"
        >
          <h2 id="plugin-docs-heading" className="product-detail-section-title">
            Documentation
          </h2>
          <a
            href={plugin.documentation_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ui-button ui-button--secondary"
          >
            View documentation
          </a>
        </section>
      ) : null}

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

  const isNotFound =
    !trimmedSlug ||
    (isAxiosError(pluginQuery.error) && pluginQuery.error.response?.status === 404)

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

  return (
    <main className="product-detail-page">
      {!trimmedSlug || isNotFound ? (
        <EmptyState
          title="Plugin not found"
          description="This plugin is unavailable, unpublished, or the link may be incorrect."
          action={
            <Link to="/plugins" className="ui-button ui-button--primary">
              Back to plugins
            </Link>
          }
        />
      ) : pluginQuery.isLoading ? (
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
