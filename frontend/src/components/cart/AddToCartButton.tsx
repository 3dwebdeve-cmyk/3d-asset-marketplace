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
  variant?: 'chip' | 'primary' | 'icon' | 'full' | 'marketplace'
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

  if (variant === 'marketplace') {
    const classes = `product-card__add-cart ${inCart ? 'product-card__add-cart--active' : ''} ${className ?? ''}`.trim()
    if (!isSignedIn) {
      return (
        <AuthEntryButton
          mode="login"
          returnTo={returnTo}
          className={classes}
          aria-label={`Sign in to add ${productName} to cart`}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="20" r="1.5" />
            <circle cx="17" cy="20" r="1.5" />
            <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h7.4a1.5 1.5 0 0 0 1.5-1.2L20 8H7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Add to Cart</span>
        </AuthEntryButton>
      )
    }

    return (
      <button
        type="button"
        className={classes}
        aria-label={inCart ? `${productName} is in cart` : `Add ${productName} to cart`}
        aria-pressed={inCart}
        disabled={isPending || inCart}
        onClick={() => {
          add(productType, productId)
        }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="20" r="1.5" />
          <circle cx="17" cy="20" r="1.5" />
          <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h7.4a1.5 1.5 0 0 0 1.5-1.2L20 8H7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{inCart ? 'In Cart' : 'Add to Cart'}</span>
      </button>
    )
  }

  if (variant === 'icon') {
    const iconCart = (
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="17" cy="20" r="1.5" />
        <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h7.4a1.5 1.5 0 0 0 1.5-1.2L20 8H7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )

    if (!isSignedIn) {
      return (
        <AuthEntryButton
          mode="login"
          returnTo={returnTo}
          className={`product-detail-stage__overlay-btn ${className ?? ''}`.trim()}
          aria-label={`Sign in to add ${productName} to cart`}
        >
          {iconCart}
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
        {iconCart}
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
          Add to cart
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

  const cartIconSvg = (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px', verticalAlign: '-2px' }}>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="17" cy="20" r="1.5" />
      <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h7.4a1.5 1.5 0 0 0 1.5-1.2L20 8H7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )

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
        {variant === 'primary' ? (
          <>
            {cartIconSvg}
            Add to Shopping Cart
          </>
        ) : (
          'Sign in to add to cart'
        )}
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
      {variant === 'primary' && cartIconSvg}
      {inCart ? (variant === 'primary' ? 'In Shopping Cart' : 'In cart') : idleLabel}
    </Button>
  )
}
