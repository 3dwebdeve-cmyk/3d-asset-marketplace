import { Link, useSearchParams } from 'react-router-dom'

import { useDocumentSeo } from '../../hooks/useDocumentSeo'

export function CheckoutCancelPage() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('order_id')

  useDocumentSeo({
    title: 'Checkout cancelled | 3D Asset Marketplace',
    description: 'Private checkout cancellation page. This page is not indexed by search engines.',
    robots: 'noindex, nofollow',
  })

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="checkout-cancel-title">
        <p className="home-page__eyebrow">Checkout</p>
        <h1 id="checkout-cancel-title">Checkout cancelled</h1>
        <p className="home-page__subtitle" role="status">
          Your payment was not completed and you have not been charged. Your cart is still saved, so
          you can try again whenever you're ready.
        </p>
        <div className="dashboard-card__actions">
          <Link className="home-page__cta" to="/cart">
            Back to cart
          </Link>
          {orderId ? (
            <Link
              className="home-page__cta home-page__cta--secondary"
              to={`/dashboard/orders/${orderId}`}
            >
              View order
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  )
}
