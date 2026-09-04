import { useLocation } from 'react-router-dom'

import { AuthEntryButton } from '../auth/AuthEntryButton'
import { useCart } from '../../hooks/useCart'
import type { CartProductType } from '../../types/cart'
import { Button } from '../ui/Button'

interface AddToCartButtonProps {
  productType: CartProductType
  productId: string
  productName: string
  className?: string
  variant?: 'chip' | 'primary' | 'icon' | 'full'
}

export function AddToCartButton({
  productType,
  productId,
  productName,
  className,
  variant = 'chip',
}: AddToCartButtonProps) {
  const location = useLocation()
  const { isSignedIn, isInCart, add, isPending } = useCart()

  const returnTo = location.pathname
  const inCart = isInCart(productType, productId)

  if (variant === 'icon') {
    if (!isSignedIn) {
      return (
        <AuthEntryButton
          mode="login"
          returnTo={returnTo}
          className={`product-detail-stage__overlay-btn ${className ?? ''}`.trim()}
          aria-label={`Sign in to add ${productName} to cart`}
        >
          <span aria-hidden="true">🛒</span>
        </AuthEntryButton>
      )
    }

    return (
      <button
        type="button"
        className={`product-detail-stage__overlay-btn ${inCart ? 'product-detail-stage__overlay-btn--active' : ''} ${className ?? ''}`.trim()}
        aria-label={inCart ? `${productName} is in cart` : `Add ${productName} to cart`}
        aria-pressed={inCart}
        disabled={isPending || inCart}
        onClick={() => {
          add(productType, productId)
        }}
      >
        <span aria-hidden="true">🛒</span>
      </button>
    )
  }

  if (variant === 'full') {
    if (!isSignedIn) {
      return (
        <AuthEntryButton
          mode="login"
          returnTo={returnTo}
          className={`ui-button ui-button--secondary product-detail-cta__full product-detail-cta__link ${className ?? ''}`.trim()}
        >
          Sign in to add to cart
        </AuthEntryButton>
      )
    }

    return (
      <Button
        type="button"
        variant="secondary"
        className={`product-detail-cta__full ${className ?? ''}`.trim()}
        aria-pressed={inCart}
        isLoading={isPending}
        onClick={() => {
          add(productType, productId)
        }}
        title={inCart ? `${productName} is already in your cart` : undefined}
      >
        {inCart ? (
          'In cart'
        ) : (
          <>
            <span aria-hidden="true">🛒</span> Add to Cart
          </>
        )}
      </Button>
    )
  }

  const buttonVariant = variant === 'primary' ? 'primary' : 'secondary'
  const baseClass =
    variant === 'primary'
      ? `ui-button ui-button--primary product-detail-cta__full ${className ?? ''}`.trim()
      : `product-detail-cta__chip ${className ?? ''}`.trim()

  if (!isSignedIn) {
    return (
      <AuthEntryButton
        mode="login"
        returnTo={returnTo}
        className={
          variant === 'primary'
            ? `ui-button ui-button--primary product-detail-cta__full product-detail-cta__link ${className ?? ''}`.trim()
            : `ui-button ui-button--secondary product-detail-cta__chip product-detail-cta__link ${className ?? ''}`.trim()
        }
      >
        Sign in to add to cart
      </AuthEntryButton>
    )
  }

  const idleLabel = variant === 'primary' ? 'Add to Shopping Cart' : 'Add to cart'

  return (
    <Button
      type="button"
      variant={buttonVariant}
      className={baseClass}
      aria-pressed={inCart}
      isLoading={isPending}
      onClick={() => {
        add(productType, productId)
      }}
      title={inCart ? `${productName} is already in your cart` : undefined}
    >
      {inCart ? 'In cart' : idleLabel}
    </Button>
  )
}
