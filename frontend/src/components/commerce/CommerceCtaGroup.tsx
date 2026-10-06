import { useLocation } from 'react-router-dom'

import { AuthEntryButton } from '../auth/AuthEntryButton'
import { AddToCartButton } from '../cart/AddToCartButton'
import { Button } from '../ui/Button'
import { WishlistToggle } from '../wishlist/WishlistToggle'
import { useBuyNow } from '../../hooks/useBuyNow'
import { useAuthStore } from '../../store/authStore'
import type { CartProductType } from '../../types/cart'

export type CommerceCtaVariant = 'buybox' | 'stacked'

export interface CommerceCtaGroupProps {
  productType: CartProductType
  productId: string
  productName: string
  productSlug: string
  variant?: CommerceCtaVariant
  showWishlist?: boolean
  showCheckoutNote?: boolean
  showShare?: boolean
}

export function CommerceCtaGroup({
  productType,
  productId,
  productName,
  productSlug,
  variant = 'stacked',
  showWishlist = false,
  showCheckoutNote = false,
  showShare = true,
}: CommerceCtaGroupProps) {
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const accessToken = useAuthStore((state) => state.accessToken)
  const { buyNow, isRedirecting } = useBuyNow()
  const isSignedIn = isAuthenticated && Boolean(accessToken)
  const returnTo = location.pathname
  const pathSegment = productType === 'product' ? 'products' : 'plugins'
  const itemLabel = productType === 'product' ? 'Product' : 'Plugin'
  const isBuybox = variant === 'buybox'

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/${pathSegment}/${productSlug}`

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        return
      }
    } catch {
      // Fall through to prompt-based share.
    }

    window.prompt(`Copy this ${itemLabel.toLowerCase()} link:`, shareUrl)
  }

  const buyButton = isSignedIn ? (
    <Button
      type="button"
      className={isBuybox ? 'product-detail-cta__full' : 'product-detail-cta__buy'}
      isLoading={isRedirecting}
      onClick={() => buyNow(productType, productId)}
    >
      {isBuybox ? 'Buy Now' : 'Buy now'}
    </Button>
  ) : (
    <AuthEntryButton
      mode="login"
      returnTo={returnTo}
      className={
        isBuybox
          ? 'ui-button ui-button--primary product-detail-cta__full product-detail-cta__link'
          : 'ui-button ui-button--primary product-detail-cta__buy product-detail-cta__link'
      }
    >
      {isBuybox ? 'Buy Now' : 'Buy now'}
    </AuthEntryButton>
  )

  const shareControl = !showShare ? null : isBuybox ? (
    <button
      type="button"
      className="product-detail-cta__share-link"
      onClick={() => {
        void handleShare()
      }}
      aria-label={`Share link for ${productName}`}
    >
      Share
    </button>
  ) : (
    <Button
      type="button"
      variant="secondary"
      className="product-detail-cta__chip"
      onClick={() => {
        void handleShare()
      }}
      aria-label={`Share link for ${productName}`}
    >
      Share
    </Button>
  )

  if (isBuybox) {
    return (
      <div className="product-detail-cta product-detail-cta--buybox">
        <div className="product-detail-cta__actions">
          {buyButton}
          <AddToCartButton
            productType={productType}
            productId={productId}
            productName={productName}
            variant="full"
          />
        </div>
        {shareControl}
      </div>
    )
  }

  return (
    <div className="product-detail-cta">
      {buyButton}

      <div className="product-detail-cta__secondary">
        <AddToCartButton
          productType={productType}
          productId={productId}
          productName={productName}
        />

        {showWishlist ? (
          <WishlistToggle
            productType={productType}
            productId={productId}
            productName={productName}
            variant="chip"
          />
        ) : null}

        {shareControl}
      </div>

      {showCheckoutNote ? (
        <p className="product-detail-cta__note">
          Buy now adds this item to your cart and opens Stripe checkout. Package downloads unlock
          after payment. No package files are exposed on this page.
        </p>
      ) : null}
    </div>
  )
}
