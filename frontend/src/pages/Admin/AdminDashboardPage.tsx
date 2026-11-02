import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { getAdminDashboardStats } from '../../api/dashboardApi'
import { AdminIcon, type AdminIconName } from '../../components/admin/AdminIcon'
import { AdminPageShell } from '../../components/admin/AdminPageShell'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { formatMoney } from '../../lib/format'
import { useAuthStore } from '../../store/authStore'

const CATEGORIES_PER_PAGE = 7

function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function StatIcon({ name }: { name: AdminIconName }) {
  return (
    <span className="admin-stat-card__icon">
      <AdminIcon name={name} size={24} />
    </span>
  )
}

export function AdminDashboardPage() {
  const statsQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'stats'],
    queryFn: getAdminDashboardStats,
  })

  const stats = statsQuery.data
  const fullName = useAuthStore((state) => state.user?.full_name)
  const [categoryQuery, setCategoryQuery] = useState('')
  const [categoryPage, setCategoryPage] = useState(1)

  const filteredCategories = useMemo(() => {
    const needle = categoryQuery.trim().toLowerCase()
    const rows = stats?.category_breakdown ?? []
    if (!needle) return rows
    return rows.filter(
      (category) =>
        category.name.toLowerCase().includes(needle) ||
        category.slug.toLowerCase().includes(needle),
    )
  }, [stats, categoryQuery])

  const pageCount = Math.max(1, Math.ceil(filteredCategories.length / CATEGORIES_PER_PAGE))
  const currentPage = Math.min(categoryPage, pageCount)
  const pageStart = (currentPage - 1) * CATEGORIES_PER_PAGE
  const visibleCategories = filteredCategories.slice(pageStart, pageStart + CATEGORIES_PER_PAGE)

  return (
    <AdminPageShell
      titleId="admin-dashboard-title"
      title="Admin dashboard"
      eyebrow={fullName ? `${greeting()}, ${fullName}` : 'Administrator'}
      className="admin-dashboard"
      subtitle="Live marketplace overview with category inventory and module readiness."
    >
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
              <StatIcon name="user" />
              <div className="admin-stat-card__body">
                <h2 className="admin-stat-card__label">Users</h2>
                <p className="admin-stat-card__value">{stats.users.active}</p>
                <p className="admin-stat-card__meta">{stats.users.total} total accounts</p>
              </div>
            </article>
            <article className="admin-stat-card">
              <StatIcon name="box" />
              <div className="admin-stat-card__body">
                <h2 className="admin-stat-card__label">Products</h2>
                <p className="admin-stat-card__value">{stats.products.published}</p>
                <p className="admin-stat-card__meta">
                  {stats.products.total} total · {stats.products.draft} draft ·{' '}
                  {stats.products.archived} archived
                </p>
              </div>
            </article>
            <article className="admin-stat-card">
              <StatIcon name="layers" />
              <div className="admin-stat-card__body">
                <h2 className="admin-stat-card__label">Live categories</h2>
                <p className="admin-stat-card__value">{stats.categories.live}</p>
                <p className="admin-stat-card__meta">
                  {stats.categories.total} categories overall
                </p>
              </div>
            </article>
            <article className="admin-stat-card">
              <StatIcon name="puzzle" />
              <div className="admin-stat-card__body">
                <h2 className="admin-stat-card__label">Plugins</h2>
                <p className="admin-stat-card__value">{stats.plugins.total}</p>
                <p className="admin-stat-card__meta">Plugin products overall</p>
              </div>
            </article>
          </div>

          <div className="admin-stats-grid admin-stats-grid--secondary">
            <article className="admin-stat-card">
              <StatIcon name="database" />
              <div className="admin-stat-card__body">
                <h2 className="admin-stat-card__label">Monthly sales</h2>
                <p className="admin-stat-card__value">
                  {formatMoney(stats.sales.monthly_revenue, stats.sales.currency)}
                </p>
                <p className="admin-stat-card__meta">
                  {stats.sales.monthly_orders} orders this month
                </p>
              </div>
            </article>
            <article className="admin-stat-card">
              <StatIcon name="card" />
              <div className="admin-stat-card__body">
                <h2 className="admin-stat-card__label">Paid payments</h2>
                <p className="admin-stat-card__value">{stats.payments.succeeded}</p>
                <p className="admin-stat-card__meta">
                  {stats.payments.pending} pending ·{' '}
                  <Link className="auth-link" to="/console/payments">
                    View payments
                  </Link>
                </p>
              </div>
            </article>
          </div>

          <section className="admin-dashboard__section" aria-labelledby="live-categories-title">
            <div className="admin-dashboard__section-head">
              <h2 id="live-categories-title">Live categories and product counts</h2>
              <label className="admin-dashboard__search">
                <AdminIcon name="search" size={16} />
                <input
                  type="search"
                  placeholder="Search category..."
                  aria-label="Search category"
                  value={categoryQuery}
                  onChange={(event) => {
                    setCategoryQuery(event.target.value)
                    setCategoryPage(1)
                  }}
                />
              </label>
            </div>
            {stats.category_breakdown.length ? (
              <>
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
                      {visibleCategories.map((category) => (
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
                <div className="admin-pagination">
                  <p className="admin-pagination__summary">
                    {filteredCategories.length
                      ? `Showing ${pageStart + 1}–${pageStart + visibleCategories.length} of ${filteredCategories.length} categories`
                      : 'No categories match your search.'}
                  </p>
                  {pageCount > 1 ? (
                    <nav className="admin-pagination__pages" aria-label="Category pages">
                      <button
                        type="button"
                        className="admin-pagination__button"
                        aria-label="Previous page"
                        disabled={currentPage === 1}
                        onClick={() => setCategoryPage(currentPage - 1)}
                      >
                        ‹
                      </button>
                      {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
                        <button
                          key={page}
                          type="button"
                          className={`admin-pagination__button${page === currentPage ? ' admin-pagination__button--active' : ''}`}
                          aria-current={page === currentPage ? 'page' : undefined}
                          onClick={() => setCategoryPage(page)}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="admin-pagination__button"
                        aria-label="Next page"
                        disabled={currentPage === pageCount}
                        onClick={() => setCategoryPage(currentPage + 1)}
                      >
                        ›
                      </button>
                    </nav>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="home-page__subtitle">
                No live categories yet. Create one to start organizing products.
              </p>
            )}
          </section>
        </>
      ) : null}

      <div className="dashboard-card__actions">
        <Link className="home-page__cta home-page__cta--secondary" to="/console/products">
          Manage products
        </Link>
        <Link className="home-page__cta home-page__cta--secondary" to="/console/categories">
          Manage categories
        </Link>
        <Link className="home-page__cta home-page__cta--secondary" to="/console/plugins">
          Manage plugins
        </Link>
        <Link className="home-page__cta home-page__cta--secondary" to="/console/orders">
          Manage orders
        </Link>
        <Link className="home-page__cta home-page__cta--secondary" to="/console/payments">
          Manage payments
        </Link>
        <Link className="home-page__cta home-page__cta--secondary" to="/console/users">
          Manage users
        </Link>
        <Link className="home-page__cta home-page__cta--secondary" to="/profile">
          Edit profile
        </Link>
      </div>
    </AdminPageShell>
  )
}
