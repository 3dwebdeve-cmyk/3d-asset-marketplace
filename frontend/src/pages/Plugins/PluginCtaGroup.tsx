import { Link, useLocation } from 'react-router-dom'

import { Button } from '../../components/ui/Button'
import { useAuthStore } from '../../store/authStore'
import { useToastStore } from '../../store/toastStore'

interface PluginCtaGroupProps {
  pluginName: string
  pluginSlug: string
}

export function PluginCtaGroup({ pluginName, pluginSlug }: PluginCtaGroupProps) {
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const accessToken = useAuthStore((state) => state.accessToken)
  const addToast = useToastStore((state) => state.addToast)
  const isSignedIn = isAuthenticated && Boolean(accessToken)

  const loginPath = '/login'
  const loginState = { from: location }

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
          disabled
          aria-disabled="true"
          title="Checkout is coming soon"
        >
          Buy now — coming soon
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
        {isSignedIn ? (
          <Button
            type="button"
            variant="secondary"
            className="product-detail-cta__chip"
            disabled
            aria-disabled="true"
            title="Add to cart is coming soon"
          >
            Add to cart — coming soon
          </Button>
        ) : (
          <Link
            to={loginPath}
            state={loginState}
            className="ui-button ui-button--secondary product-detail-cta__chip product-detail-cta__link"
          >
            Sign in to add to cart
          </Link>
        )}

        {isSignedIn ? (
          <Button
            type="button"
            variant="secondary"
            className="product-detail-cta__chip"
            disabled
            aria-disabled="true"
            title="Add to wishlist is coming soon"
          >
            Wishlist — coming soon
          </Button>
        ) : (
          <Link
            to={loginPath}
            state={loginState}
            className="ui-button ui-button--secondary product-detail-cta__chip product-detail-cta__link"
          >
            Sign in to add to wishlist
          </Link>
        )}

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
        Checkout, cart, wishlist, and downloads unlock in later releases. No package files are
        exposed on this page.
      </p>
    </div>
  )
}
