import { useState } from 'react'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { Link } from 'react-router-dom'

import { useCart } from '../../hooks/useCart'
import { useCheckout } from '../../hooks/useCheckout'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { CartLineItem } from '../../components/cart/CartLineItem'
import { formatMoney } from '../../lib/format'
import type { CartItem } from '../../types/cart'

/** One model (any of its variations) or one plugin per checkout: lines are grouped by item. */
function checkoutGroup(item: CartItem): string {
  return `${item.product_type}:${item.product_id}`
}

export function CartPage() {
  useDocumentSeo({
    title: 'Your cart | AssetHive 3D',
    description: 'Review the 3D models and plugins in your cart before checkout.',
    robots: 'noindex, nofollow',
  })

  const {
    cart,
    isLoading,
    isError,
    isPending,
    updateQuantity,
    remove,
    clear,
    refetch,
  } = useCart()
  const { startCheckout, isRedirecting } = useCheckout()
  // Checkout takes one model (any of its variations) or one plugin. Until the customer ticks
  // something, every available line of the first item in the cart is selected.
  const [ticked, setTicked] = useState<ReadonlySet<string> | null>(null)
  const [switchedItem, setSwitchedItem] = useState(false)
  const available = (cart?.items ?? []).filter((item) => item.catalog?.is_available)
  const firstGroup = available[0] ? checkoutGroup(available[0]) : null
  const effectiveTicked =
    ticked ??
    new Set(available.filter((item) => checkoutGroup(item) === firstGroup).map((item) => item.id))
  const selected = available.filter((item) => effectiveTicked.has(item.id))
  const selectedTotal = selected.reduce((sum, item) => sum + Number(item.line_total ?? 0), 0)
  const selectedGroup = selected[0] ? checkoutGroup(selected[0]) : null
  const hasSeveralItems = new Set(available.map(checkoutGroup)).size > 1
  const toggle = (item: CartItem) => {
    if (selectedGroup && checkoutGroup(item) !== selectedGroup) {
      // Another model: it replaces the selection (one model per checkout).
      setTicked(new Set([item.id]))
      setSwitchedItem(true)
      return
    }
    const next = new Set(effectiveTicked)
    if (!next.delete(item.id)) next.add(item.id)
    setTicked(next)
  }

  const isEmpty = cart?.item_count === 0
  const showTopActions = !isLoading && !isEmpty

  return (
    <main className="dashboard-page cart-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="cart-title">
        <p className="home-page__eyebrow">Shopping</p>
        <h1 id="cart-title">Your cart</h1>
        <p className="home-page__subtitle">
          Review items before checkout. Prices reflect current catalog values.
        </p>

        {showTopActions ? (
          <div className="dashboard-card__actions">
            <Link className="home-page__cta home-page__cta--secondary" to="/">
              Browse models
            </Link>
            <Link className="home-page__cta home-page__cta--secondary" to="/plugins">
              Browse plugins
            </Link>
            <Button
              type="button"
              variant="secondary"
              isLoading={isPending}
              onClick={() => clear()}
            >
              Clear cart
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <Spinner label="Loading your cart..." />
        ) : isError ? (
          <ErrorState
            title="Could not load your cart"
            description="Your cart could not be loaded. Please try again."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  void refetch()
                }}
              >
                Retry
              </Button>
            }
          />
        ) : isEmpty ? (
          <div>
            <p className="home-page__subtitle" role="status">
              Your cart is empty. Add products or plugins to get started.
            </p>
            <div className="dashboard-card__actions">
              <Link className="home-page__cta" to="/">
                Browse models
              </Link>
              <Link className="home-page__cta home-page__cta--secondary" to="/plugins">
                Browse plugins
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="cart-page__items">
              {cart?.items.map((item) => (
                <div key={item.id} className="cart-page__line">
                  <input
                    type="checkbox"
                    aria-label={`Buy ${item.catalog?.title ?? 'this item'}`}
                    checked={Boolean(item.catalog?.is_available) && effectiveTicked.has(item.id)}
                    disabled={!item.catalog?.is_available}
                    onChange={() => toggle(item)}
                  />
                  <CartLineItem
                    item={item}
                    currency={cart.currency}
                    isUpdating={isPending}
                    isRemoving={isPending}
                    onUpdateQuantity={updateQuantity}
                    onRemove={remove}
                  />
                </div>
              ))}
            </div>

            <footer className="cart-page__footer">
              <div className="cart-summary cart-summary--page">
                <span>Subtotal</span>
                <strong>
                  {formatMoney(cart?.subtotal ?? '0.00', cart?.currency ?? 'USD')}
                </strong>
              </div>
              <div className="cart-summary cart-summary--page cart-summary--total">
                <span>Selected total</span>
                <strong>
                  {formatMoney(selectedTotal.toFixed(2), cart?.currency ?? 'USD')}
                </strong>
              </div>
              <p className="cart-summary__note">
                Unavailable items are excluded from the subtotal.
              </p>
              {hasSeveralItems ? (
                <p className="cart-summary__note" role={switchedItem ? 'status' : undefined}>
                  Check out one model (any of its variations) or one plugin at a time. The rest
                  stay in your cart.
                </p>
              ) : null}
              <p className="cart-summary__note cart-summary__note--legal">
                By checking out you agree to our{' '}
                <Link className="auth-link" to="/terms">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link className="auth-link" to="/privacy">
                  Privacy Policy
                </Link>
                .
              </p>
              <Button
                type="button"
                className="cart-checkout-button"
                isLoading={isRedirecting}
                disabled={selected.length === 0}
                onClick={() =>
                  startCheckout(
                    selected.map((item) => ({
                      product_type: item.product_type,
                      product_id: item.product_id,
                      ...(item.package_kind ? { package_kind: item.package_kind } : {}),
                    })),
                  )
                }
              >
                Checkout selected ({selected.length})
              </Button>
            </footer>
          </>
        )}
      </section>
    </main>
  )
}
