import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { listWishlistItems, removeWishlistItem } from '../../api/wishlistApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import { toast } from '../../lib/toast'
import type { WishlistItem, WishlistProductType } from '../../types/wishlist'

const PAGE_SIZE = 20

type WishlistFilter = 'all' | WishlistProductType

function formatPrice(price: string, currency: string): string {
  const value = Number(price)
  if (Number.isNaN(value)) {
    return `${currency} ${price}`
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(value)
  } catch {
    return `${currency} ${price}`
  }
}

function getDetailPath(item: WishlistItem): string | null {
  if (!item.catalog?.slug) {
    return null
  }
  return item.product_type === 'product'
    ? `/products/${item.catalog.slug}`
    : `/plugins/${item.catalog.slug}`
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
  const typeLabel = item.product_type === 'product' ? 'Product' : 'Plugin'

  return (
    <article
      className={`product-card wishlist-card ${catalog && !catalog.is_available ? 'wishlist-card--unavailable' : ''}`}
    >
      <div className="product-card__media">
        {catalog?.thumbnail ? (
          <img
            src={catalog.thumbnail}
            alt={catalog.name}
            className="product-card__image"
            loading="lazy"
          />
        ) : (
          <div className="product-card__image-placeholder" aria-hidden="true">
            <span className="product-card__placeholder-text">{typeLabel}</span>
          </div>
        )}
        <span className="product-card__badge-license">{typeLabel}</span>
        {catalog && !catalog.is_available ? (
          <span className="wishlist-card__unavailable-badge">No longer available</span>
        ) : null}
      </div>

      <div className="product-card__body">
        <div className="product-card__meta">
          <span className="product-card__category">
            {catalog?.category.name ?? 'Unavailable'}
          </span>
        </div>

        <h3 className="product-card__title">
          {detailPath ? (
            <Link to={detailPath} className="product-card__title-link">
              {catalog?.name ?? 'Unavailable item'}
            </Link>
          ) : (
            <span>{catalog?.name ?? 'Unavailable item'}</span>
          )}
        </h3>

        {catalog?.short_description ? (
          <p className="product-card__description">{catalog.short_description}</p>
        ) : null}

        <div className="product-card__footer">
          <div className="product-card__price-container">
            {catalog ? (
              <>
                <span className="product-card__price">
                  {formatPrice(
                    catalog.discount_price && Number(catalog.discount_price) < Number(catalog.price)
                      ? catalog.discount_price
                      : catalog.price,
                    catalog.currency,
                  )}
                </span>
                {catalog.discount_price &&
                Number(catalog.discount_price) < Number(catalog.price) ? (
                  <span className="product-card__price product-card__price--original">
                    {formatPrice(catalog.price, catalog.currency)}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="product-card__price">—</span>
            )}
          </div>

          <div className="wishlist-card__actions">
            {detailPath ? (
              <Link to={detailPath} className="product-card__cta">
                View details
              </Link>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              isLoading={isRemoving}
              onClick={() => onRemove(item.id)}
            >
              Remove
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}

export function WishlistPage() {
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
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="wishlist-title"
      >
        <p className="home-page__eyebrow">Customer Dashboard</p>
        <h1 id="wishlist-title">Wishlist</h1>
        <p className="home-page__subtitle">
          Products and plugins you saved for later.
        </p>

        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/">
            Browse models
          </Link>
          <Link className="home-page__cta home-page__cta--secondary" to="/plugins">
            Browse plugins
          </Link>
        </div>

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
          <div>
            <p className="home-page__subtitle" role="status">
              Your wishlist is empty. Browse the marketplace to save items for later.
            </p>
            <div className="dashboard-card__actions">
              <Link className="home-page__cta" to="/">
                Browse models
              </Link>
              <Link className="home-page__cta home-page__cta--secondary" to="/plugins">
                Browse plugins
              </Link>
            </div>
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
            <div className="dashboard-card__actions" aria-label="Wishlist pagination">
              <Button
                type="button"
                variant="secondary"
                disabled={!wishlistQuery.data?.previous}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                type="button"
                variant="secondary"
                disabled={!wishlistQuery.data?.next}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
