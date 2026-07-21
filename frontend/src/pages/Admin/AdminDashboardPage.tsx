import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { getAdminDashboardStats } from '../../api/dashboardApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'

function formatCurrency(amount: string, currency: string): string {
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

export function AdminDashboardPage() {
  const statsQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'stats'],
    queryFn: getAdminDashboardStats,
  })

  const stats = statsQuery.data

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide admin-dashboard"
        aria-labelledby="admin-dashboard-title"
      >
        <p className="home-page__eyebrow">Administrator</p>
        <h1 id="admin-dashboard-title">Admin dashboard</h1>
        <p className="home-page__subtitle">
          Live marketplace overview with category inventory and module readiness.
        </p>

        {statsQuery.isLoading ? (
          <Spinner label="Loading dashboard stats..." />
        ) : statsQuery.isError ? (
          <ErrorState
            title="Could not load dashboard stats"
            description="The server did not return marketplace overview data."
            action={
              <Button
                variant="secondary"
                isLoading={statsQuery.isFetching}
                onClick={() => statsQuery.refetch()}
              >
                Retry
              </Button>
            }
          />
        ) : stats ? (
          <>
            <div className="admin-stats-grid" aria-label="Marketplace summary">
              <article className="admin-stat-card">
                <h2 className="admin-stat-card__label">Users</h2>
                <p className="admin-stat-card__value">{stats.users.active}</p>
                <p className="admin-stat-card__meta">
                  {stats.users.total} total accounts
                </p>
              </article>
              <article className="admin-stat-card">
                <h2 className="admin-stat-card__label">Products</h2>
                <p className="admin-stat-card__value">{stats.products.published}</p>
                <p className="admin-stat-card__meta">
                  {stats.products.total} total · {stats.products.draft} draft ·{' '}
                  {stats.products.archived} archived
                </p>
              </article>
              <article className="admin-stat-card">
                <h2 className="admin-stat-card__label">Live categories</h2>
                <p className="admin-stat-card__value">{stats.categories.live}</p>
                <p className="admin-stat-card__meta">
                  {stats.categories.total} categories overall
                </p>
              </article>
              <article className="admin-stat-card">
                <h2 className="admin-stat-card__label">Plugins</h2>
                <p className="admin-stat-card__value">{stats.plugins.total}</p>
                <p className="admin-stat-card__meta">Plugin store not live yet</p>
              </article>
            </div>

            <div className="admin-stats-grid admin-stats-grid--secondary">
              <article className="admin-stat-card">
                <h2 className="admin-stat-card__label">Pending projects</h2>
                <p className="admin-stat-card__value">{stats.projects.pending}</p>
                <p className="admin-stat-card__meta">Awaiting admin review</p>
              </article>
              <article className="admin-stat-card">
                <h2 className="admin-stat-card__label">Live projects</h2>
                <p className="admin-stat-card__value">{stats.projects.live}</p>
                <p className="admin-stat-card__meta">
                  {stats.projects.completed} completed overall
                </p>
              </article>
              <article className="admin-stat-card">
                <h2 className="admin-stat-card__label">Monthly sales</h2>
                <p className="admin-stat-card__value">
                  {formatCurrency(stats.sales.monthly_revenue, stats.sales.currency)}
                </p>
                <p className="admin-stat-card__meta">
                  {stats.sales.monthly_orders} orders this month
                </p>
              </article>
            </div>

            <section className="admin-dashboard__section" aria-labelledby="live-categories-title">
              <h2 id="live-categories-title">Live categories and product counts</h2>
              {stats.category_breakdown.length ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th scope="col">Category</th>
                        <th scope="col">Slug</th>
                        <th scope="col">Products</th>
                        <th scope="col">Published</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.category_breakdown.map((category) => (
                        <tr key={category.id}>
                          <td>{category.name}</td>
                          <td>{category.slug}</td>
                          <td>{category.product_count}</td>
                          <td>{category.published_product_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="home-page__subtitle">
                  No live categories yet. Create one to start organizing products.
                </p>
              )}
            </section>
          </>
        ) : null}

        <div className="dashboard-card__actions">
          <Link className="home-page__cta home-page__cta--secondary" to="/admin/products">
            Manage products
          </Link>
          <Link className="home-page__cta home-page__cta--secondary" to="/admin/categories">
            Manage categories
          </Link>
          <Link className="home-page__cta home-page__cta--secondary" to="/admin/users">
            Manage users
          </Link>
          <Link className="home-page__cta home-page__cta--secondary" to="/profile">
            Edit profile
          </Link>
        </div>
      </section>
    </main>
  )
}
