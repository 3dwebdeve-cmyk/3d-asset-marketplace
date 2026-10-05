import { useLocation } from 'react-router-dom'

import { AuthEntryButton } from '../auth/AuthEntryButton'
import { useWishlist } from '../../hooks/useWishlist'
import type { WishlistProductType } from '../../types/wishlist'
import { Button } from '../ui/Button'

interface WishlistToggleProps {
  productType: WishlistProductType
  productId: string
  productName: string
  variant?: 'chip' | 'icon' | 'full'
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

  const heartIcon = (filled: boolean) => (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill={filled ? '#ef4444' : 'none'}
      stroke={filled ? '#ef4444' : 'currentColor'}
      strokeWidth="2"
      aria-hidden="true"
      style={{ marginRight: '6px', verticalAlign: '-2px' }}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )

  const stageHeartIcon = (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill={wishlisted ? '#ef4444' : 'none'}
      stroke={wishlisted ? '#ef4444' : 'currentColor'}
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )

  if (!isSignedIn) {
    if (variant === 'icon') {
      return (
        <AuthEntryButton
          mode="login"
          returnTo={returnTo}
          className={`product-card__wishlist product-card__wishlist--guest product-detail-stage__overlay-btn ${className ?? ''}`.trim()}
          aria-label={`Sign in to add ${productName} to wishlist`}
        >
          {stageHeartIcon}
        </AuthEntryButton>
      )
    }

    if (variant === 'full') {
      return (
        <AuthEntryButton
          mode="login"
          returnTo={returnTo}
          className={`ui-button ui-button--secondary product-detail-cta__full product-detail-cta__link ${className ?? ''}`.trim()}
        >
          {heartIcon(false)}
          Add to Wishlist
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
        className={`product-card__wishlist product-detail-stage__overlay-btn ${wishlisted ? 'product-card__wishlist--active product-detail-stage__overlay-btn--active' : ''} ${className ?? ''}`.trim()}
        aria-label={`${label} for ${productName}`}
        aria-pressed={wishlisted}
        disabled={isPending}
        onClick={() => {
          toggle(productType, productId)
        }}
      >
        {stageHeartIcon}
      </button>
    )
  }

  if (variant === 'full') {
    return (
      <Button
        type="button"
        variant="secondary"
        className={`product-detail-cta__full ${className ?? ''}`.trim()}
        aria-pressed={wishlisted}
        isLoading={isPending}
        onClick={() => {
          toggle(productType, productId)
        }}
      >
        {heartIcon(wishlisted)}
        {wishlisted ? 'In Wishlist' : 'Add to Wishlist'}
      </Button>
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
