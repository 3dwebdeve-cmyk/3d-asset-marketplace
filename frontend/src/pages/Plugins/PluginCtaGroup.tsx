import { useLocation } from 'react-router-dom'

import { AuthEntryButton } from '../../components/auth/AuthEntryButton'
import { WishlistToggle } from '../../components/wishlist/WishlistToggle'
import { AddToCartButton } from '../../components/cart/AddToCartButton'
import { Button } from '../../components/ui/Button'
import { useBuyNow } from '../../hooks/useBuyNow'
import { useAuthStore } from '../../store/authStore'
import { useToastStore } from '../../store/toastStore'

interface PluginCtaGroupProps {
  pluginId: string
  pluginName: string
  pluginSlug: string
}

export function PluginCtaGroup({ pluginId, pluginName, pluginSlug }: PluginCtaGroupProps) {
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const accessToken = useAuthStore((state) => state.accessToken)
  const addToast = useToastStore((state) => state.addToast)
  const { buyNow, isRedirecting } = useBuyNow()
  const isSignedIn = isAuthenticated && Boolean(accessToken)
  const returnTo = location.pathname

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/plugins/${pluginSlug}`

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        addToast({
          variant: 'success',
          message: 'Plugin link copied to clipboard.',
        })
        return
      }
    } catch {
      // Fall through to prompt-based share.
    }

    window.prompt('Copy this plugin link:', shareUrl)
  }

  return (
    <div className="product-detail-cta">
      {isSignedIn ? (
        <Button
          type="button"
          className="product-detail-cta__buy"
          isLoading={isRedirecting}
          onClick={() => buyNow('plugin', pluginId)}
        >
          Buy now
        </Button>
      ) : (
        <AuthEntryButton
          mode="login"
          returnTo={returnTo}
          className="ui-button ui-button--primary product-detail-cta__buy product-detail-cta__link"
        >
          Sign in to buy
        </AuthEntryButton>
      )}

      <div className="product-detail-cta__secondary">
        <AddToCartButton
          productType="plugin"
          productId={pluginId}
          productName={pluginName}
        />

        <WishlistToggle
          productType="plugin"
          productId={pluginId}
          productName={pluginName}
          variant="chip"
        />

        <Button
          type="button"
          variant="secondary"
          className="product-detail-cta__chip"
          onClick={() => {
            void handleShare()
          }}
          aria-label={`Share link for ${pluginName}`}
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
