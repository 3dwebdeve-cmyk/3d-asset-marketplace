import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { listCustomerOrders } from '../../api/ordersApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Pagination } from '../../components/ui/Pagination'
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
import { formatMoneyPlain, formatDate } from '../../lib/format'

const PAGE_SIZE = 20

type StatusFilter = '' | OrderStatus
type PaymentFilter = '' | OrderPaymentStatus

export function MyOrdersPage() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const isCustomerSession = isAuthenticated && !isAdministrator(user?.role)

  const [page, setPage] = useState(1)
  const [orderStatus, setOrderStatus] = useState<StatusFilter>('')
  const [paymentStatus, setPaymentStatus] = useState<PaymentFilter>('')

  const ordersQuery = useQuery({
    queryKey: ['orders', 'custom-project', { page, orderStatus, paymentStatus }],
    queryFn: () =>
      listCustomerOrders({
        page,
        page_size: PAGE_SIZE,
        ordering: '-created_at',
        item_type: 'custom_project',
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
  const totalPages = Math.ceil((ordersQuery.data?.count ?? 0) / PAGE_SIZE)

  return (
    <main className="dash-list-page" aria-labelledby="my-orders-title">
      <header className="dash-list-page__header">
        <h1 id="my-orders-title" className="dash-list-page__title">
          My Orders
        </h1>
        <p className="dash-list-page__subtitle">
          Payments for custom work you commissioned from the studio.
        </p>
      </header>

      {!isCustomerSession ? (
        <section className="dash-list-page__card">
          <p className="dash-list-page__status" role="status">
            Order history is available for customer accounts.
          </p>
        </section>
      ) : ordersQuery.isLoading ? (
        <section className="dash-list-page__card">
          <Spinner label="Loading your orders..." />
        </section>
      ) : ordersQuery.isError ? (
        <section className="dash-list-page__card">
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
        </section>
      ) : isTrulyEmpty ? (
        <section className="dash-list-page__card">
          <p className="dash-list-page__status" role="status">
            You have no custom project orders yet. Request custom work from My Projects to get
            started.
          </p>
          <div className="dash-list-page__actions">
            <Link
              className="dash-list-page__btn dash-list-page__btn--primary"
              to="/dashboard/projects/new"
            >
              Request custom work
            </Link>
            <Link className="dash-list-page__btn" to="/dashboard/projects">
              My projects
            </Link>
          </div>
        </section>
      ) : (
        <>
          <div className="dash-list-page__filters" aria-label="Order filters">
            <label className="dash-list-page__filter">
              <span className="dash-list-page__filter-label">Order status</span>
              <select
                className="dash-list-page__filter-select"
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
            <label className="dash-list-page__filter">
              <span className="dash-list-page__filter-label">Payment status</span>
              <select
                className="dash-list-page__filter-select"
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

          <section className="dash-list-page__card">
            <div className="dash-list-page__table-wrap">
              <table className="dash-list-page__table">
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
                            className="dash-list-page__link"
                            to={detailPath}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {order.invoice_number}
                          </Link>
                        </td>
                        <td>{formatDate(order.created_at)}</td>
                        <td>{formatMoneyPlain(order.total_amount, order.currency)}</td>
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
                <p className="dash-list-page__status" role="status">
                  No orders match your filters.
                </p>
              ) : null}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              ariaLabel="Order pagination"
            />
          </section>
        </>
      )}
    </main>
  )
}
