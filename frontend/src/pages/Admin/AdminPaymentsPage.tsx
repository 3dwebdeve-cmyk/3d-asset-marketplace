import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { listAdminPayments } from '../../api/paymentsApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { getApiErrorMessage } from '../../lib/apiError'
import {
  PAYMENT_STATUS_LABELS,
  type PaymentOrdering,
  type PaymentStatus,
  type PaymentStatusFilter,
} from '../../types/payment'

function formatMoney(amount: string, currency: string): string {
  return `${currency} ${amount}`
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const STATUS_FILTER_OPTIONS: { value: PaymentStatusFilter | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
]

export function AdminPaymentsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<PaymentStatusFilter | ''>('')
  const [createdAfter, setCreatedAfter] = useState('')
  const [createdBefore, setCreatedBefore] = useState('')
  const [ordering, setOrdering] = useState<PaymentOrdering>('-created_at')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search)

  const paymentsQuery = useQuery({
    queryKey: [
      'admin',
      'payments',
      {
        search: debouncedSearch,
        status,
        createdAfter,
        createdBefore,
        ordering,
        page,
      },
    ],
    queryFn: () =>
      listAdminPayments({
        search: debouncedSearch || undefined,
        status: (status || undefined) as PaymentStatusFilter | undefined,
        created_after: createdAfter || undefined,
        created_before: createdBefore || undefined,
        ordering,
        page,
        page_size: 20,
      }),
  })

  const resetPage = () => setPage(1)
  const results = paymentsQuery.data?.results ?? []

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="payments-title"
      >
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="payments-title">Payments</h1>
        <p className="home-page__subtitle">
          Review Stripe checkout payments, amounts, statuses, and linked orders.
        </p>

        <div className="admin-filters">
          <Input
            aria-label="Search payments"
            placeholder="Search invoice number or customer email"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              resetPage()
            }}
          />
          <select
            className="ui-input"
            aria-label="Filter by payment status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as PaymentStatusFilter | '')
              resetPage()
            }}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Input
            type="date"
            aria-label="Created after"
            value={createdAfter}
            onChange={(event) => {
              setCreatedAfter(event.target.value)
              resetPage()
            }}
          />
          <Input
            type="date"
            aria-label="Created before"
            value={createdBefore}
            onChange={(event) => {
              setCreatedBefore(event.target.value)
              resetPage()
            }}
          />
          <select
            className="ui-input"
            aria-label="Order payments"
            value={ordering}
            onChange={(event) => {
              setOrdering(event.target.value as PaymentOrdering)
              resetPage()
            }}
          >
            <option value="-created_at">Newest first</option>
            <option value="created_at">Oldest first</option>
            <option value="-amount">Highest amount</option>
            <option value="amount">Lowest amount</option>
            <option value="status">Status A–Z</option>
            <option value="-status">Status Z–A</option>
          </select>
        </div>

        {paymentsQuery.isLoading ? (
          <Spinner label="Loading payments..." />
        ) : paymentsQuery.isError ? (
          <ErrorState
            title="Could not load payments"
            description={getApiErrorMessage(
              paymentsQuery.error,
              'Administrator payment list could not be loaded.',
            )}
            action={
              <Button variant="secondary" onClick={() => paymentsQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Invoice</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Status</th>
                    <th scope="col">Stripe session</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatDate(payment.created_at)}</td>
                      <td>{payment.customer_email}</td>
                      <td>
                        <Link className="auth-link" to={`/admin/orders/${payment.order_id}`}>
                          {payment.invoice_number}
                        </Link>
                      </td>
                      <td>{formatMoney(payment.amount, payment.currency)}</td>
                      <td>
                        {PAYMENT_STATUS_LABELS[payment.status as PaymentStatus] ??
                          payment.status}
                      </td>
                      <td>
                        <code>{payment.stripe_checkout_session_id}</code>
                      </td>
                      <td>
                        <Link className="auth-link" to={`/admin/payments/${payment.id}`}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.length === 0 ? (
                <p className="home-page__subtitle" role="status">
                  No payments match your filters.
                </p>
              ) : null}
            </div>
            <div className="dashboard-card__actions" aria-label="Payment pagination">
              <Button
                type="button"
                variant="secondary"
                disabled={!paymentsQuery.data?.previous}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                type="button"
                variant="secondary"
                disabled={!paymentsQuery.data?.next}
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
