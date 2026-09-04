import { useLocation } from 'react-router-dom'

import { AuthEntryButton } from '../../components/auth/AuthEntryButton'
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
  const returnTo = location.pathname

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
    <div className="product-detail-cta product-detail-cta--buybox">
      <div className="product-detail-cta__actions">
        {isSignedIn ? (
          <Button
            type="button"
            className="product-detail-cta__full"
            isLoading={isRedirecting}
            onClick={() => buyNow('product', productId)}
          >
            Buy Now
          </Button>
        ) : (
          <AuthEntryButton
            mode="login"
            returnTo={returnTo}
            className="ui-button ui-button--primary product-detail-cta__full product-detail-cta__link"
          >
            Sign in to buy
          </AuthEntryButton>
        )}

        <AddToCartButton
          productType="product"
          productId={productId}
          productName={productName}
          variant="full"
        />
      </div>

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
    </div>
  )
}
