import { Link, useLocation } from 'react-router-dom'

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

  const loginPath = '/login'
  const loginState = { from: location }
  const inCart = isInCart(productType, productId)

  if (!isSignedIn) {
    return (
      <Link
        to={loginPath}
        state={loginState}
        className={`ui-button ui-button--secondary product-detail-cta__chip product-detail-cta__link ${className ?? ''}`.trim()}
      >
        Sign in to add to cart
      </Link>
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
