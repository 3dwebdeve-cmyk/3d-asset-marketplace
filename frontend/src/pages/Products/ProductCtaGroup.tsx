import { Link, useLocation } from 'react-router-dom'

import { WishlistToggle } from '../../components/wishlist/WishlistToggle'
import { AddToCartButton } from '../../components/cart/AddToCartButton'
import { Button } from '../../components/ui/Button'
import { useBuyNow } from '../../hooks/useBuyNow'
import { useAuthStore } from '../../store/authStore'
import { useToastStore } from '../../store/toastStore'

interface ProductCtaGroupProps {
  productId: string
  productName: string
  productSlug: string
}

export function ProductCtaGroup({ productId, productName, productSlug }: ProductCtaGroupProps) {
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const accessToken = useAuthStore((state) => state.accessToken)
  const addToast = useToastStore((state) => state.addToast)
  const { buyNow, isRedirecting } = useBuyNow()
  const isSignedIn = isAuthenticated && Boolean(accessToken)

  const loginPath = '/login'
  const loginState = { from: location }

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/products/${productSlug}`

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        addToast({
          variant: 'success',
          message: 'Product link copied to clipboard.',
        })
        return
      }
    } catch {
      // Fall through to prompt-based share.
    }

    window.prompt('Copy this product link:', shareUrl)
  }

  return (
    <div className="product-detail-cta">
      {isSignedIn ? (
        <Button
          type="button"
          className="product-detail-cta__buy"
          isLoading={isRedirecting}
          onClick={() => buyNow('product', productId)}
        >
          Buy now
        </Button>
      ) : (
        <Link
          to={loginPath}
          state={loginState}
          className="ui-button ui-button--primary product-detail-cta__buy product-detail-cta__link"
        >
          Sign in to buy
        </Link>
      )}

      <div className="product-detail-cta__secondary">
        <AddToCartButton
          productType="product"
          productId={productId}
          productName={productName}
        />

        <WishlistToggle
          productType="product"
          productId={productId}
          productName={productName}
          variant="chip"
        />

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
      </div>

      <p className="product-detail-cta__note">
        Buy now adds this item to your cart and opens Stripe checkout. Package downloads unlock
        after payment. No package files are exposed on this page.
      </p>
    </div>
  )
}
