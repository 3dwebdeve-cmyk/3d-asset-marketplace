import { Link } from 'react-router-dom'

import { useCart } from '../../hooks/useCart'
import { useCartUiStore } from '../../store/cartUiStore'
import { Button } from '../ui/Button'
import { ErrorState } from '../ui/ErrorState'
import { Spinner } from '../ui/Spinner'
import { CartLineItem, formatCartPrice } from './CartLineItem'

export function CartDrawer() {
  const isDrawerOpen = useCartUiStore((state) => state.isDrawerOpen)
  const closeDrawer = useCartUiStore((state) => state.closeDrawer)
  const { cart, isLoading, isError, isPending, updateQuantity, remove, refetch } = useCart()

  if (!isDrawerOpen) {
    return null
  }

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
          <h2 id="cart-drawer-title">Your cart</h2>
          <button
            type="button"
            className="cart-drawer__close"
            aria-label="Close cart drawer"
            onClick={closeDrawer}
          >
            ×
          </button>
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
          ) : !cart || cart.item_count === 0 ? (
            <p className="cart-drawer__empty" role="status">
              Your cart is empty.
            </p>
          ) : (
            <div className="cart-drawer__items">
              {cart.items.map((item) => (
                <CartLineItem
                  key={item.id}
                  item={item}
                  currency={cart.currency}
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

        {cart && cart.item_count > 0 ? (
          <footer className="cart-drawer__footer">
            <div className="cart-summary">
              <span>Subtotal</span>
              <strong>{formatCartPrice(cart.subtotal, cart.currency)}</strong>
            </div>
            <p className="cart-summary__note">
              Unavailable items are excluded from the subtotal.
            </p>
            <Button
              type="button"
              className="cart-checkout-button"
              disabled
              aria-disabled="true"
              title="Payments coming soon"
            >
              Payments coming soon
            </Button>
            <Link
              to="/cart"
              className="ui-button ui-button--secondary cart-drawer__view-all"
              onClick={closeDrawer}
            >
              View full cart
            </Link>
          </footer>
        ) : null}
      </aside>
    </div>
  )
}
