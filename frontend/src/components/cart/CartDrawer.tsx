import { Link } from 'react-router-dom'

import { useCart } from '../../hooks/useCart'
import { useCheckout } from '../../hooks/useCheckout'
import { useCartUiStore } from '../../store/cartUiStore'
import { Button } from '../ui/Button'
import { ErrorState } from '../ui/ErrorState'
import { Spinner } from '../ui/Spinner'
import { CartLineItem, formatCartPrice } from './CartLineItem'

export function CartDrawer() {
  const isDrawerOpen = useCartUiStore((state) => state.isDrawerOpen)
  const closeDrawer = useCartUiStore((state) => state.closeDrawer)
  const { cart, isLoading, isError, isPending, updateQuantity, remove, refetch } = useCart()
  const { startCheckout, isRedirecting } = useCheckout()

  if (!isDrawerOpen) {
    return null
  }

  const itemCount = cart?.total_quantity ?? cart?.item_count ?? 0
  const hasItems = Boolean(cart && cart.item_count > 0)

  return (
    <div className="cart-drawer" role="presentation">
      <button
        type="button"
        className="cart-drawer__backdrop"
        aria-label="Close cart"
        onClick={closeDrawer}
      />
      <aside
        className="cart-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        <header className="cart-drawer__header">
          <div className="cart-drawer__header-row">
            <h2 id="cart-drawer-title" className="cart-drawer__title">
              Cart
              {itemCount > 0 ? (
                <sup className="cart-drawer__count" aria-label={`${itemCount} items`}>
                  {itemCount}
                </sup>
              ) : null}
            </h2>
            <button
              type="button"
              className="cart-drawer__close"
              aria-label="Close cart drawer"
              onClick={closeDrawer}
            >
              ×
            </button>
          </div>
          <div className="cart-drawer__trust">
            <p className="cart-drawer__trust-title">Secure payment</p>
            <p className="cart-drawer__trust-methods">
              Visa, Mastercard, PayPal, Apple Pay, 3X or 4X free of charge
            </p>
          </div>
        </header>

        <div className="cart-drawer__body">
          {isLoading ? (
            <Spinner label="Loading your cart..." />
          ) : isError ? (
            <ErrorState
              title="Could not load cart"
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
          ) : !hasItems ? (
            <p className="cart-drawer__empty" role="status">
              Your cart is empty.
            </p>
          ) : (
            <div className="cart-drawer__items">
              {cart!.items.map((item) => (
                <CartLineItem
                  key={item.id}
                  item={item}
                  currency={cart!.currency}
                  compact
                  isUpdating={isPending}
                  isRemoving={isPending}
                  onUpdateQuantity={updateQuantity}
                  onRemove={remove}
                />
              ))}
            </div>
          )}
        </div>

        {hasItems && cart ? (
          <footer className="cart-drawer__footer">
            {Number(cart.discount_amount) > 0 ? (
              <div className="cart-summary cart-summary--discount">
                <span>Discount</span>
                <strong>−{formatCartPrice(cart.discount_amount, cart.currency)}</strong>
              </div>
            ) : null}
            <div className="cart-summary cart-summary--total">
              <span>Total</span>
              <strong>{formatCartPrice(cart.total, cart.currency)}</strong>
            </div>
            <Button
              type="button"
              className="cart-checkout-button cart-checkout-button--secure"
              isLoading={isRedirecting}
              onClick={() => startCheckout()}
            >
              Checkout securely •
            </Button>
            <Link to="/cart" className="cart-drawer__view-all" onClick={closeDrawer}>
              View full cart details
            </Link>
          </footer>
        ) : null}
      </aside>
    </div>
  )
}
