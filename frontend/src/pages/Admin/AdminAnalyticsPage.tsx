import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { getAdminAnalytics } from '../../api/analyticsApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import type { AdminAnalyticsTopItem } from '../../types/analytics'

function formatMoney(amount: string, currency: string): string {
  const parsed = Number.parseFloat(amount)
  if (Number.isNaN(parsed)) {
    return `${currency} ${amount}`
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed)
}

function formatPeriod(period: string): string {
  const [year, month] = period.split('-')
  if (!year || !month) return period
  const date = new Date(Number(year), Number(month) - 1, 1)
  if (Number.isNaN(date.getTime())) return period
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
}

function defaultMonthStart(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}-01`
}

function defaultToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function TopItemsTable({
  items,
  currency,
  emptyLabel,
}: {
  items: AdminAnalyticsTopItem[]
  currency: string
  emptyLabel: string
}) {
  if (items.length === 0) {
    return (
      <p className="home-page__subtitle" role="status">
        {emptyLabel}
      </p>
    )
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Qty sold</th>
            <th scope="col">Orders</th>
            <th scope="col">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.product_type}-${item.product_id}`}>
              <td>
                <span>{item.title}</span>
                {item.slug ? (
                  <span className="admin-stat-card__meta"> / {item.slug}</span>
                ) : null}
              </td>
              <td>{item.quantity_sold}</td>
              <td>{item.order_count}</td>
              <td>{formatMoney(item.revenue, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AdminAnalyticsPage() {
  const [startDate, setStartDate] = useState(defaultMonthStart)
  const [endDate, setEndDate] = useState(defaultToday)

  const analyticsQuery = useQuery({
    queryKey: ['admin', 'analytics', { startDate, endDate }],
    queryFn: () =>
      getAdminAnalytics({
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }),
  })

  const data = analyticsQuery.data
  const currency = data?.currency ?? 'USD'

  const appliedRangeLabel = useMemo(() => {
    if (!data) return ''
    return `${data.filters.start_date} → ${data.filters.end_date}`
  }, [data])

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide admin-dashboard"
        aria-labelledby="analytics-title"
      >
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="analytics-title">Analytics</h1>
        <p className="home-page__subtitle">
          Order-based revenue, top catalog performers, and payment gateway totals.
        </p>

        <div className="admin-filters">
          <Input
            type="date"
            aria-label="Start date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <Input
            type="date"
            aria-label="End date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setStartDate(defaultMonthStart())
              setEndDate(defaultToday())
            }}
          >
            This month
          </Button>
          <Link className="auth-link" to="/console/orders">
            View orders
          </Link>
        </div>

        {analyticsQuery.isLoading ? (
          <Spinner label="Loading analytics..." />
        ) : analyticsQuery.isError ? (
          <ErrorState
            title="Could not load analytics"
            description={getApiErrorMessage(
              analyticsQuery.error,
              'Administrator analytics could not be loaded.',
            )}
            action={
              <Button variant="secondary" onClick={() => analyticsQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : data ? (
          <>
            <p className="home-page__subtitle" role="status">
              Showing {appliedRangeLabel}
            </p>

            <div className="admin-stats-grid" aria-label="Order summary">
              <article className="admin-stat-card">
                <h2 className="admin-stat-card__label">Revenue</h2>
                <p className="admin-stat-card__value">
                  {formatMoney(data.summary.revenue, currency)}
                </p>
                <p className="admin-stat-card__meta">
                  From {data.summary.paid_order_count} paid orders
                </p>
              </article>
              <article className="admin-stat-card">
                <h2 className="admin-stat-card__label">Orders</h2>
                <p className="admin-stat-card__value">{data.summary.order_count}</p>
                <p className="admin-stat-card__meta">
                  {data.summary.pending_order_count} pending ·{' '}
                  {data.summary.refunded_order_count} refunded ·{' '}
                  {data.summary.cancelled_order_count} cancelled
                </p>
              </article>
              <article className="admin-stat-card">
                <h2 className="admin-stat-card__label">Avg. order value</h2>
                <p className="admin-stat-card__value">
                  {formatMoney(data.summary.average_order_value, currency)}
                </p>
                <p className="admin-stat-card__meta">Paid orders only</p>
              </article>
              <article className="admin-stat-card">
                <h2 className="admin-stat-card__label">Gateway payments</h2>
                <p className="admin-stat-card__value">
                  {data.gateway_breakdown.reduce(
                    (total, row) => total + row.payment_count,
                    0,
                  )}
                </p>
                <p className="admin-stat-card__meta">
                  Succeeded payments in range ·{' '}
                  <Link className="auth-link" to="/console/payments">
                    View payments
                  </Link>
                </p>
              </article>
            </div>

            <section
              className="admin-dashboard__section"
              aria-labelledby="revenue-by-period-title"
            >
              <h2 id="revenue-by-period-title">Revenue by period</h2>
              {data.revenue_by_period.length ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">Period</th>
                        <th scope="col">Paid orders</th>
                        <th scope="col">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.revenue_by_period.map((row) => (
                        <tr key={row.period}>
                          <td>{formatPeriod(row.period)}</td>
                          <td>{row.order_count}</td>
                          <td>{formatMoney(row.revenue, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="home-page__subtitle" role="status">
                  No paid orders in this date range.
                </p>
              )}
            </section>

            <section
              className="admin-dashboard__section"
              aria-labelledby="top-products-title"
            >
              <h2 id="top-products-title">Top products</h2>
              <TopItemsTable
                items={data.top_products}
                currency={currency}
                emptyLabel="No product sales in this date range."
              />
            </section>

            <section
              className="admin-dashboard__section"
              aria-labelledby="top-plugins-title"
            >
              <h2 id="top-plugins-title">Top plugins</h2>
              <TopItemsTable
                items={data.top_plugins}
                currency={currency}
                emptyLabel="No plugin sales in this date range."
              />
            </section>

            <section
              className="admin-dashboard__section"
              aria-labelledby="gateway-breakdown-title"
            >
              <h2 id="gateway-breakdown-title">Gateway breakdown</h2>
              {data.gateway_breakdown.length ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">Gateway</th>
                        <th scope="col">Payments</th>
                        <th scope="col">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.gateway_breakdown.map((row) => (
                        <tr key={row.gateway}>
                          <td>{row.gateway}</td>
                          <td>{row.payment_count}</td>
                          <td>{formatMoney(row.revenue, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="home-page__subtitle" role="status">
                  No succeeded gateway payments in this date range.
                </p>
              )}
            </section>
          </>
        ) : null}
      </section>
    </main>
  )
}
