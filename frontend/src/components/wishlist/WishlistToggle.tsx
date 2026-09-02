import { useLocation } from 'react-router-dom'

import { AuthEntryButton } from '../auth/AuthEntryButton'
import { useWishlist } from '../../hooks/useWishlist'
import type { WishlistProductType } from '../../types/wishlist'
import { Button } from '../ui/Button'

interface WishlistToggleProps {
  productType: WishlistProductType
  productId: string
  productName: string
  variant?: 'chip' | 'icon'
  className?: string
}

export function WishlistToggle({
  productType,
  productId,
  productName,
  variant = 'chip',
  className,
}: WishlistToggleProps) {
  const location = useLocation()
  const { isSignedIn, isWishlisted, toggle, isPending } = useWishlist()

  const returnTo = location.pathname
  const wishlisted = isWishlisted(productType, productId)

  if (!isSignedIn) {
    if (variant === 'icon') {
      return (
        <AuthEntryButton
          mode="login"
          returnTo={returnTo}
          className={`product-card__wishlist product-card__wishlist--guest ${className ?? ''}`.trim()}
          aria-label={`Sign in to add ${productName} to wishlist`}
        >
          <span className="product-card__wishlist-icon" aria-hidden="true">
            ♡
          </span>
        </AuthEntryButton>
      )
    }

    return (
      <AuthEntryButton
        mode="login"
        returnTo={returnTo}
        className="ui-button ui-button--secondary product-detail-cta__chip product-detail-cta__link"
      >
        Sign in to add to wishlist
      </AuthEntryButton>
    )
  }

  const label = wishlisted ? 'Remove from wishlist' : 'Add to wishlist'

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className={`product-card__wishlist ${wishlisted ? 'product-card__wishlist--active' : ''} ${className ?? ''}`.trim()}
        aria-label={`${label} for ${productName}`}
        aria-pressed={wishlisted}
        disabled={isPending}
        onClick={() => {
          toggle(productType, productId)
        }}
      >
        <span className="product-card__wishlist-icon" aria-hidden="true">
          {wishlisted ? '♥' : '♡'}
        </span>
      </button>
    )
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className="product-detail-cta__chip"
      aria-pressed={wishlisted}
      isLoading={isPending}
      onClick={() => {
        toggle(productType, productId)
      }}
    >
      {wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
    </Button>
  )
}
