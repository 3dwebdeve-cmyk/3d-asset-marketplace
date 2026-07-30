import { Link } from 'react-router-dom'

import { useCart } from '../../hooks/useCart'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { CartCouponForm } from '../../components/cart/CartCouponForm'
import { CartLineItem, formatCartPrice } from '../../components/cart/CartLineItem'

export function CartPage() {
  const {
    cart,
    isLoading,
    isError,
    isPending,
    updateQuantity,
    remove,
    clear,
    applyCoupon,
    removeCoupon,
    couponError,
    clearCouponError,
    refetch,
  } = useCart()

  const isEmpty = cart?.item_count === 0

  return (
    <main className="dashboard-page cart-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="cart-title">
        <p className="home-page__eyebrow">Shopping</p>
        <h1 id="cart-title">Your cart</h1>
        <p className="home-page__subtitle">
          Review items before checkout. Prices reflect current catalog values.
        </p>

        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/products">
            Browse models
          </Link>
          <Link className="home-page__cta home-page__cta--secondary" to="/plugins">
            Browse plugins
          </Link>
          {cart && cart.item_count > 0 ? (
            <Button
              type="button"
              variant="secondary"
              isLoading={isPending}
              onClick={() => clear()}
            >
              Clear cart
            </Button>
          ) : null}
        </div>

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
              <Link className="home-page__cta" to="/products">
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
                <CartLineItem
                  key={item.id}
                  item={item}
                  currency={cart.currency}
                  isUpdating={isPending}
                  isRemoving={isPending}
                  onUpdateQuantity={updateQuantity}
                  onRemove={remove}
                />
              ))}
            </div>

            <footer className="cart-page__footer">
              <CartCouponForm
                coupon={cart?.coupon ?? null}
                isPending={isPending}
                error={couponError}
                onApply={applyCoupon}
                onRemove={removeCoupon}
                onClearError={clearCouponError}
              />
              <div className="cart-summary cart-summary--page">
                <span>Subtotal</span>
                <strong>
                  {formatCartPrice(cart?.subtotal ?? '0.00', cart?.currency ?? 'USD')}
                </strong>
              </div>
              {cart && Number(cart.discount_amount) > 0 ? (
                <div className="cart-summary cart-summary--discount">
                  <span>Discount</span>
                  <strong>
                    −{formatCartPrice(cart.discount_amount, cart.currency)}
                  </strong>
                </div>
              ) : null}
              <div className="cart-summary cart-summary--page cart-summary--total">
                <span>Total</span>
                <strong>
                  {formatCartPrice(cart?.total ?? '0.00', cart?.currency ?? 'USD')}
                </strong>
              </div>
              <p className="cart-summary__note">
                Unavailable items are excluded from the subtotal. Checkout unlocks in a later
                release.
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
            </footer>
          </>
        )}
      </section>
    </main>
  )
}
