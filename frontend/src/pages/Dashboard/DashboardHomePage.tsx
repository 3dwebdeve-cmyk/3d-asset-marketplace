import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { listDownloadEntitlements } from '../../api/downloadsApi'
import { listCustomerOrders } from '../../api/ordersApi'
import { listWishlistItems } from '../../api/wishlistApi'
import { useAuthStore } from '../../store/authStore'
import type { CustomerOrderListItem } from '../../types/order'

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function sumPaidSpend(orders: CustomerOrderListItem[]) {
  let total = 0
  let currency = 'USD'
  for (const order of orders) {
    if (order.payment_status !== 'paid') continue
    const amount = Number.parseFloat(order.total_amount)
    if (!Number.isFinite(amount)) continue
    total += amount
    if (order.currency) currency = order.currency
  }
  return { total, currency }
}

function CardIcon({ name }: { name: 'orders' | 'wishlist' | 'downloads' }) {
  switch (name) {
    case 'orders':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 6.5h2.2l1.1 9.2a1.5 1.5 0 0 0 1.5 1.3h8.9a1.5 1.5 0 0 0 1.5-1.2l1.1-6.3H7" />
          <circle cx="9.5" cy="19.5" r="1.2" />
          <circle cx="16.5" cy="19.5" r="1.2" />
        </svg>
      )
    case 'wishlist':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20s-7-4.35-9-8.5C1.5 8.2 3.4 5 6.8 5c1.8 0 3.1 1 3.9 2 .8-1 2.1-2 3.9-2C18.6 5 20.5 8.2 19 11.5 17 15.65 12 20 12 20Z" />
        </svg>
      )
    case 'downloads':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15" />
          <path d="M12 4v10" />
          <path d="m8.5 10.5 3.5 3.5 3.5-3.5" />
        </svg>
      )
  }
}

function ActionIcon({ name }: { name: 'wishlist' | 'orders' | 'downloads' | 'profile' }) {
  switch (name) {
    case 'wishlist':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20s-7-4.35-9-8.5C1.5 8.2 3.4 5 6.8 5c1.8 0 3.1 1 3.9 2 .8-1 2.1-2 3.9-2C18.6 5 20.5 8.2 19 11.5 17 15.65 12 20 12 20Z" />
        </svg>
      )
    case 'orders':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 6.5h2.2l1.1 9.2a1.5 1.5 0 0 0 1.5 1.3h8.9a1.5 1.5 0 0 0 1.5-1.2l1.1-6.3H7" />
          <circle cx="9.5" cy="19.5" r="1.2" />
          <circle cx="16.5" cy="19.5" r="1.2" />
        </svg>
      )
    case 'downloads':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15" />
          <path d="M12 4v10" />
          <path d="m8.5 10.5 3.5 3.5 3.5-3.5" />
        </svg>
      )
    case 'profile':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.25" />
          <path d="M5.5 19.25c1.1-3.1 3.4-4.65 6.5-4.65s5.4 1.55 6.5 4.65" />
        </svg>
      )
  }
}

const QUICK_ACTIONS = [
  { to: '/dashboard/wishlist', label: 'Saved Wishlist', icon: 'wishlist' as const },
  { to: '/dashboard/orders', label: 'Orders History', icon: 'orders' as const },
  { to: '/dashboard/downloads', label: 'Downloads', icon: 'downloads' as const },
  { to: '/profile', label: 'Edit Profile', icon: 'profile' as const },
]

export function DashboardHomePage() {
  const user = useAuthStore((state) => state.user)
  const firstName = user?.full_name?.trim().split(/\s+/)[0] || 'User'

  const [ordersQuery, wishlistQuery, downloadsQuery] = useQueries({
    queries: [
      {
        queryKey: ['dashboard', 'home', 'orders'],
        queryFn: () => listCustomerOrders({ page: 1, page_size: 100 }),
      },
      {
        queryKey: ['dashboard', 'home', 'wishlist'],
        queryFn: () => listWishlistItems({ page: 1, page_size: 1 }),
      },
      {
        queryKey: ['dashboard', 'home', 'downloads'],
        queryFn: () => listDownloadEntitlements(),
      },
    ],
  })

  const paidSpend = ordersQuery.data ? sumPaidSpend(ordersQuery.data.results) : null

  const ordersMeta =
    paidSpend != null
      ? `${formatCurrency(paidSpend.total, paidSpend.currency)} lifetime spend`
      : ordersQuery.isError
        ? 'Could not load order details'
        : 'Loading…'

  return (
    <main className="dash-home" aria-labelledby="dash-home-title">
      <header className="dash-home__header">
        <h1 id="dash-home-title" className="dash-home__title">
          Welcome back, {firstName}!
        </h1>
        <p className="dash-home__subtitle">
          Manage your 3D assets, orders, downloads, and account settings.
        </p>
      </header>

      <section className="dash-home__stats" aria-label="Account summary">
        <Link to="/dashboard/orders" className="dash-home-stat">
          <div className="dash-home-stat__top">
            <p className="dash-home-stat__label">Total Orders</p>
            <span className="dash-home-stat__icon" aria-hidden="true">
              <CardIcon name="orders" />
            </span>
          </div>
          <p className="dash-home-stat__value">
            {ordersQuery.isError ? '—' : ordersQuery.isLoading ? '…' : ordersQuery.data?.count ?? 0}
          </p>
          <p className="dash-home-stat__meta">{ordersMeta}</p>
        </Link>

        <Link to="/dashboard/wishlist" className="dash-home-stat">
          <div className="dash-home-stat__top">
            <p className="dash-home-stat__label">Saved in Wishlist</p>
            <span className="dash-home-stat__icon" aria-hidden="true">
              <CardIcon name="wishlist" />
            </span>
          </div>
          <p className="dash-home-stat__value">
            {wishlistQuery.isError
              ? '—'
              : wishlistQuery.isLoading
                ? '…'
                : wishlistQuery.data?.count ?? 0}
          </p>
          <p className="dash-home-stat__meta">Browse models &amp; plugins</p>
        </Link>

        <Link to="/dashboard/downloads" className="dash-home-stat">
          <div className="dash-home-stat__top">
            <p className="dash-home-stat__label">My Downloads</p>
            <span className="dash-home-stat__icon" aria-hidden="true">
              <CardIcon name="downloads" />
            </span>
          </div>
          <p className="dash-home-stat__value">
            {downloadsQuery.isError
              ? '—'
              : downloadsQuery.isLoading
                ? '…'
                : downloadsQuery.data?.length ?? 0}
          </p>
          <p className="dash-home-stat__meta">Ready for instant download</p>
        </Link>
      </section>

      <section className="dash-home__actions" aria-labelledby="dash-home-actions-title">
        <h2 id="dash-home-actions-title" className="dash-home__actions-title">
          Quick Actions
        </h2>
        <div className="dash-home__actions-row">
          {QUICK_ACTIONS.map((action) => (
            <Link key={action.to} to={action.to} className="dash-home-action">
              <ActionIcon name={action.icon} />
              <span>{action.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
