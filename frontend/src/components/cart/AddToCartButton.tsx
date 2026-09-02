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
}

export function AddToCartButton({
  productType,
  productId,
  productName,
  className,
}: AddToCartButtonProps) {
  const location = useLocation()
  const { isSignedIn, isInCart, add, isPending } = useCart()

  const returnTo = location.pathname
  const inCart = isInCart(productType, productId)

  if (!isSignedIn) {
    return (
      <AuthEntryButton
        mode="login"
        returnTo={returnTo}
        className={`ui-button ui-button--secondary product-detail-cta__chip product-detail-cta__link ${className ?? ''}`.trim()}
      >
        Sign in to add to cart
      </AuthEntryButton>
    )
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className={`product-detail-cta__chip ${className ?? ''}`.trim()}
      aria-pressed={inCart}
      isLoading={isPending}
      onClick={() => {
        add(productType, productId)
      }}
      title={inCart ? `${productName} is already in your cart` : undefined}
    >
      {inCart ? 'In cart' : 'Add to cart'}
    </Button>
  )
}
