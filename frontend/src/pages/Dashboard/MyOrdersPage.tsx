import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { listCustomerOrders } from '../../api/ordersApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import {
  OrderPaymentStatusBadge,
  OrderStatusBadge,
} from '../../components/ui/StatusBadge'
import { isAdministrator } from '../../lib/roles'
import { useAuthStore } from '../../store/authStore'
import {
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  type OrderPaymentStatus,
  type OrderStatus,
} from '../../types/order'

const PAGE_SIZE = 20

type StatusFilter = '' | OrderStatus
type PaymentFilter = '' | OrderPaymentStatus

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatMoney(amount: string, currency: string): string {
  return `${currency} ${amount}`
}

export function MyOrdersPage() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const isCustomerSession = isAuthenticated && !isAdministrator(user?.role)

  const [page, setPage] = useState(1)
  const [orderStatus, setOrderStatus] = useState<StatusFilter>('')
  const [paymentStatus, setPaymentStatus] = useState<PaymentFilter>('')

  const ordersQuery = useQuery({
    queryKey: ['orders', 'page', { page, orderStatus, paymentStatus }],
    queryFn: () =>
      listCustomerOrders({
        page,
        page_size: PAGE_SIZE,
        ordering: '-created_at',
        order_status: orderStatus || undefined,
        payment_status: paymentStatus || undefined,
      }),
    enabled: isCustomerSession,
  })

  useEffect(() => {
    setPage(1)
  }, [orderStatus, paymentStatus])

  useEffect(() => {
    if (!ordersQuery.isSuccess || !ordersQuery.data) return
    if (
      ordersQuery.data.results.length === 0 &&
      ordersQuery.data.previous &&
      page > 1
    ) {
      setPage((current) => Math.max(1, current - 1))
    }
  }, [ordersQuery.isSuccess, ordersQuery.data, page])

  const results = ordersQuery.data?.results ?? []
  const isTrulyEmpty =
    ordersQuery.isSuccess && (ordersQuery.data?.count ?? 0) === 0

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="my-orders-title"
      >
        <p className="home-page__eyebrow">Customer Dashboard</p>
        <h1 id="my-orders-title">My orders</h1>
        <p className="home-page__subtitle">
          View your purchase history, order status, and line items.
        </p>
        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/dashboard">
            Back to dashboard
          </Link>
          <Link className="home-page__cta home-page__cta--secondary" to="/products">
            Browse models
          </Link>
          <Link className="home-page__cta home-page__cta--secondary" to="/plugins">
            Browse plugins
          </Link>
        </div>

        {!isCustomerSession ? (
          <p className="home-page__subtitle" role="status">
            Order history is available for customer accounts.
          </p>
        ) : ordersQuery.isLoading ? (
          <Spinner label="Loading your orders..." />
        ) : ordersQuery.isError ? (
          <ErrorState
            title="Could not load your orders"
            description="Your orders could not be loaded. Please try again."
            action={
              <Button
                variant="secondary"
                isLoading={ordersQuery.isFetching}
                onClick={() => ordersQuery.refetch()}
              >
                Retry
              </Button>
            }
          />
        ) : isTrulyEmpty ? (
          <div>
            <p className="home-page__subtitle" role="status">
              You have no orders yet. Browse the marketplace to find models and plugins.
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
            <div className="dashboard-card__actions" aria-label="Order filters">
              <label className="admin-filter-field">
                <span className="admin-filter-field__label">Order status</span>
                <select
                  className="admin-filter-field__input"
                  value={orderStatus}
                  onChange={(event) => setOrderStatus(event.target.value as StatusFilter)}
                >
                  <option value="">All</option>
                  {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {ORDER_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-filter-field">
                <span className="admin-filter-field__label">Payment status</span>
                <select
                  className="admin-filter-field__input"
                  value={paymentStatus}
                  onChange={(event) => setPaymentStatus(event.target.value as PaymentFilter)}
                >
                  <option value="">All</option>
                  {(Object.keys(ORDER_PAYMENT_STATUS_LABELS) as OrderPaymentStatus[]).map(
                    (status) => (
                      <option key={status} value={status}>
                        {ORDER_PAYMENT_STATUS_LABELS[status]}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Invoice</th>
                    <th scope="col">Date</th>
                    <th scope="col">Total</th>
                    <th scope="col">Order status</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((order) => {
                    const detailPath = `/dashboard/orders/${order.id}`
                    return (
                      <tr
                        key={order.id}
                        className="admin-table__row--clickable"
                        tabIndex={0}
                        onClick={() => navigate(detailPath)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            navigate(detailPath)
                          }
                        }}
                      >
                        <td>
                          <Link
                            className="auth-link"
                            to={detailPath}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {order.invoice_number}
                          </Link>
                        </td>
                        <td>{formatDate(order.created_at)}</td>
                        <td>{formatMoney(order.total_amount, order.currency)}</td>
                        <td>
                          <OrderStatusBadge status={order.order_status} />
                        </td>
                        <td>
                          <OrderPaymentStatusBadge status={order.payment_status} />
                        </td>
                        <td>{order.item_count}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {results.length === 0 ? (
                <p className="home-page__subtitle" role="status">
                  No orders match your filters.
                </p>
              ) : null}
            </div>

            <div className="dashboard-card__actions" aria-label="Order pagination">
              <Button
                type="button"
                variant="secondary"
                disabled={!ordersQuery.data?.previous}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                type="button"
                variant="secondary"
                disabled={!ordersQuery.data?.next}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
