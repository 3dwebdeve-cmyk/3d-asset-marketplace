import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { listWishlistItems, removeWishlistItem } from '../../api/wishlistApi'
import { AddToCartButton } from '../../components/cart/AddToCartButton'
import { RatingDisplay } from '../../components/reviews/RatingDisplay'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Pagination } from '../../components/ui/Pagination'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { formatMoney } from '../../lib/format'
import { toast } from '../../lib/toast'
import type { WishlistItem, WishlistProductType } from '../../types/wishlist'
import '../../styles/products-browse.css'

const PAGE_SIZE = 20

type WishlistFilter = 'all' | WishlistProductType

function getDetailPath(item: WishlistItem): string | null {
  if (!item.catalog?.slug) {
    return null
  }
  return item.product_type === 'product'
    ? `/products/${item.catalog.slug}`
    : `/plugins/${item.catalog.slug}`
}

function getBadgeLabel(item: WishlistItem): string {
  const categoryName = item.catalog?.category.name?.trim()
  if (categoryName) {
    return categoryName.toUpperCase()
  }
  return item.product_type === 'plugin' ? 'PLUGIN' : '3D MODEL'
}

function getSpecs(item: WishlistItem): string {
  const catalog = item.catalog
  if (!catalog) {
    return ''
  }

  if (item.product_type === 'plugin') {
    const parts: string[] = []
    if (catalog.compatibility?.trim()) {
      parts.push(
        ...catalog.compatibility
          .split(/[,|/]/)
          .map((part) => part.trim())
          .filter(Boolean)
          .slice(0, 2),
      )
    }
    if (catalog.version?.trim()) {
      parts.push(`v${catalog.version.trim()}`)
    }
    if (parts.length === 0 && catalog.license_type) {
      parts.push(formatLicense(catalog.license_type))
    }
    return parts.join(' • ')
  }

  return formatLicense(catalog.license_type)
}

function formatLicense(licenseType: string): string {
  if (!licenseType) {
    return ''
  }
  return licenseType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function WishlistItemCard({
  item,
  isRemoving,
  onRemove,
}: {
  item: WishlistItem
  isRemoving: boolean
  onRemove: (itemId: string) => void
}) {
  const catalog = item.catalog
  const detailPath = getDetailPath(item)
  const isAvailable = Boolean(catalog?.is_available)
  const typeLabel = item.product_type === 'product' ? 'Product' : 'Plugin'
  const badgeLabel = getBadgeLabel(item)
  const specs = getSpecs(item)
  const displayName = catalog?.name ?? 'Unavailable item'

  const hasDiscount = Boolean(
    catalog?.discount_price && Number(catalog.discount_price) < Number(catalog.price),
  )

  return (
    <article
      className={`product-card wishlist-card ${catalog && !catalog.is_available ? 'wishlist-card--unavailable' : ''}`}
    >
      <div className="product-card__media">
        {detailPath ? (
          <Link to={detailPath} className="product-card__media-link" tabIndex={-1}>
            {catalog?.thumbnail ? (
              <img
                src={catalog.thumbnail}
                alt=""
                className="product-card__image"
                loading="lazy"
              />
            ) : (
              <div className="product-card__image-placeholder" aria-hidden="true">
                <span className="product-card__placeholder-text">{typeLabel}</span>
              </div>
            )}
          </Link>
        ) : catalog?.thumbnail ? (
          <img
            src={catalog.thumbnail}
            alt=""
            className="product-card__image"
            loading="lazy"
          />
        ) : (
          <div className="product-card__image-placeholder" aria-hidden="true">
            <span className="product-card__placeholder-text">{typeLabel}</span>
          </div>
        )}

        <span
          className={`wishlist-card__badge ${item.product_type === 'plugin' ? 'wishlist-card__badge--plugin' : ''}`}
        >
          {badgeLabel}
        </span>

        <button
          type="button"
          className="product-card__wishlist product-card__wishlist--active wishlist-card__heart"
          aria-label={`Remove ${displayName} from wishlist`}
          aria-pressed="true"
          disabled={isRemoving}
          onClick={() => onRemove(item.id)}
        >
          <span className="product-card__wishlist-icon" aria-hidden="true">
            ♥
          </span>
        </button>

        {catalog && !catalog.is_available ? (
          <span className="wishlist-card__unavailable-badge">No longer available</span>
        ) : null}
      </div>

      <div className="product-card__body wishlist-card__body">
        <div className="wishlist-card__meta">
          <RatingDisplay
            averageRating={catalog?.average_rating ?? 0}
            className="wishlist-card__rating"
          />
          {specs ? <span className="wishlist-card__specs">{specs}</span> : null}
        </div>

        <h3 className="product-card__title wishlist-card__title">
          {detailPath ? (
            <Link to={detailPath} className="product-card__title-link">
              {displayName}
            </Link>
          ) : (
            <span>{displayName}</span>
          )}
        </h3>

        <div className="wishlist-card__footer">
          <div className="product-card__price-container">
            {catalog ? (
              <>
                <span className="product-card__price">
                  {formatMoney(
                    hasDiscount ? catalog.discount_price : catalog.price,
                    catalog.currency,
                  )}
                </span>
                {hasDiscount ? (
                  <span className="product-card__price product-card__price--original">
                    {formatMoney(catalog.price, catalog.currency)}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="product-card__price">—</span>
            )}
          </div>

          {isAvailable && catalog ? (
            <AddToCartButton
              productType={item.product_type}
              productId={item.product_id}
              productName={catalog.name}
              variant="marketplace"
            />
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function WishlistPage() {
  useDocumentSeo({
    title: 'Wishlist | AssetHive 3D',
    description: 'Saved 3D models and plugins on your AssetHive 3D wishlist.',
    robots: 'noindex, nofollow',
  })

  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<WishlistFilter>('all')
  const [removingId, setRemovingId] = useState<string | null>(null)

  const productType = filter === 'all' ? undefined : filter

  const wishlistQuery = useQuery({
    queryKey: ['wishlist', 'page', { page, productType }],
    queryFn: () =>
      listWishlistItems({
        page,
        page_size: PAGE_SIZE,
        product_type: productType,
        ordering: '-created_at',
      }),
  })

  useEffect(() => {
    setPage(1)
  }, [filter])

  useEffect(() => {
    if (!wishlistQuery.isSuccess || !wishlistQuery.data) return
    if (wishlistQuery.data.results.length === 0 && wishlistQuery.data.previous && page > 1) {
      setPage((current) => Math.max(1, current - 1))
    }
  }, [wishlistQuery.isSuccess, wishlistQuery.data, page])

  const removeMutation = useMutation({
    mutationFn: removeWishlistItem,
    onMutate: (itemId) => {
      setRemovingId(itemId)
    },
    onSuccess: async () => {
      toast.success('Removed from wishlist.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wishlist', 'page'] }),
        queryClient.invalidateQueries({ queryKey: ['wishlist', 'count'] }),
        queryClient.invalidateQueries({ queryKey: ['wishlist', 'lookup'] }),
      ])
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Could not remove from wishlist.'))
    },
    onSettled: () => {
      setRemovingId(null)
    },
  })

  const results = wishlistQuery.data?.results ?? []
  const isTrulyEmpty =
    wishlistQuery.isSuccess && (wishlistQuery.data?.count ?? 0) === 0 && filter === 'all'

  const filterButtons: { id: WishlistFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'product', label: 'Products' },
    { id: 'plugin', label: 'Plugins' },
  ]

  return (
    <main className="dashboard-page wishlist-page">
      <section
        className="dashboard-card dashboard-card--wide wishlist-page__panel"
        aria-labelledby="wishlist-title"
      >
        <p className="home-page__eyebrow">Customer Dashboard</p>
        <h1 id="wishlist-title">Wishlist</h1>
        <p className="home-page__subtitle">
          Products and plugins you saved for later.
        </p>

        <div className="wishlist-filters" role="tablist" aria-label="Wishlist filters">
          {filterButtons.map((button) => (
            <button
              key={button.id}
              type="button"
              role="tab"
              aria-selected={filter === button.id}
              className={`wishlist-filters__button ${filter === button.id ? 'wishlist-filters__button--active' : ''}`}
              onClick={() => setFilter(button.id)}
            >
              {button.label}
            </button>
          ))}
        </div>

        {wishlistQuery.isLoading ? (
          <Spinner label="Loading your wishlist..." />
        ) : wishlistQuery.isError ? (
          <ErrorState
            title="Could not load your wishlist"
            description="Your saved items could not be loaded. Please try again."
            action={
              <Button
                variant="secondary"
                isLoading={wishlistQuery.isFetching}
                onClick={() => wishlistQuery.refetch()}
              >
                Retry
              </Button>
            }
          />
        ) : isTrulyEmpty ? (
          <div className="wishlist-empty-state">
            <p className="home-page__subtitle" role="status">
              Your wishlist is empty. Browse the marketplace to save items for later.
            </p>
            <Link className="home-page__cta" to="/3d-models">
              Browse models
            </Link>
          </div>
        ) : results.length === 0 ? (
          <p className="home-page__subtitle" role="status">
            No {filter === 'all' ? 'items' : filter === 'product' ? 'products' : 'plugins'} on
            this page.
          </p>
        ) : (
          <>
            <div className="products-grid wishlist-grid">
              {results.map((item) => (
                <WishlistItemCard
                  key={item.id}
                  item={item}
                  isRemoving={removingId === item.id && removeMutation.isPending}
                  onRemove={(itemId) => removeMutation.mutate(itemId)}
                />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={Math.ceil((wishlistQuery.data?.count ?? 0) / PAGE_SIZE)}
              onPageChange={setPage}
              ariaLabel="Wishlist pagination"
            />
          </>
        )}
      </section>
    </main>
  )
}
