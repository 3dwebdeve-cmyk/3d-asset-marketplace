import { useEffect, useId, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { AdminIcon, navIconFor } from '../components/admin/AdminIcon'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { Spinner } from '../components/ui/Spinner'
import { adminNavItems } from '../config/adminNav'
import { adminPath } from '../config/adminPaths'
import { useAdminSession } from '../hooks/useAdminSession'
import { useDocumentSeo } from '../hooks/useDocumentSeo'
import { useNotFoundChrome } from '../hooks/useNotFoundChrome'
import '../styles/admin-layout.css'

export function AdminLayout() {
  const navId = useId()
  const { user, isLoading, isError, isFetching, refetch, signOut, isSigningOut } =
    useAdminSession()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const location = useLocation()
  const { isNotFound } = useNotFoundChrome()

  useDocumentSeo({
    title: 'Admin console | AssetHive3D',
    description: 'Private administrator control panel.',
    robots: 'noindex, nofollow',
  })

  useEffect(() => {
    setIsMobileNavOpen(false)
  }, [location.pathname])

  const currentLabel =
    adminNavItems.find((item) => {
      const [itemPath, itemQuery] = item.to.split('?')
      if (itemQuery) return false
      return item.end
        ? location.pathname === itemPath
        : location.pathname === itemPath || location.pathname.startsWith(`${itemPath}/`)
    })?.label ?? 'Dashboard'

  if (isLoading) {
    return <Spinner fullPage label="Verifying administrator access..." />
  }

  if (isError) {
    return (
      <div className="admin-layout admin-layout--centered">
        <ErrorState
          title="Administrator access denied"
          description="Your account is signed in, but the server rejected administrator access."
          action={
            <Button
              variant="secondary"
              isLoading={isFetching}
              onClick={() => refetch()}
            >
              Retry
            </Button>
          }
        />
      </div>
    )
  }

  if (isNotFound) {
    return <Outlet />
  }

  return (
    <div className="admin-layout">
      {isMobileNavOpen ? (
        <button
          type="button"
          className="admin-layout__overlay"
          aria-label="Close navigation menu"
          onClick={() => setIsMobileNavOpen(false)}
        />
      ) : null}

      <aside
        className={`admin-sidebar${isMobileNavOpen ? ' admin-sidebar--open' : ''}`}
        aria-label="Admin navigation"
      >
        <div className="admin-sidebar__brand">
          <span className="admin-sidebar__logo-plate">
            <img
              src="/images/AssetHive%203D.svg"
              alt="AssetHive3D"
              className="admin-sidebar__logo"
              width={176}
              height={30}
            />
          </span>
          <p className="admin-sidebar__title">Admin Panel</p>
        </div>

        <p className="admin-sidebar__group-label">Main</p>

        <nav id={navId} className="admin-sidebar__nav" aria-label="Admin sections">
          <ul className="admin-sidebar__list">
            {adminNavItems.map((item) => {
              const [itemPath, itemQuery] = item.to.split('?')
              const currentParams = new URLSearchParams(location.search)
              let isActive = false
              if (itemQuery) {
                const expected = new URLSearchParams(itemQuery)
                isActive =
                  location.pathname === itemPath &&
                  [...expected.entries()].every(
                    ([key, value]) => currentParams.get(key) === value,
                  )
              } else if (itemPath === adminPath('products')) {
                isActive =
                  (location.pathname === adminPath('products') ||
                    location.pathname.startsWith(`${adminPath('products')}/`)) &&
                  currentParams.get('status') !== 'pending_review'
              } else if (item.end) {
                isActive = location.pathname === itemPath
              } else {
                isActive =
                  location.pathname === itemPath ||
                  location.pathname.startsWith(`${itemPath}/`)
              }

              return (
                <li key={item.to}>
                  {item.enabled ? (
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={`admin-sidebar__link${isActive ? ' admin-sidebar__link--active' : ''}`}
                      onClick={() => setIsMobileNavOpen(false)}
                    >
                      <AdminIcon name={navIconFor(item.label)} />
                      <span className="admin-sidebar__label">{item.label}</span>
                    </NavLink>
                  ) : (
                    <span
                      className="admin-sidebar__link admin-sidebar__link--disabled"
                      aria-disabled="true"
                    >
                      <AdminIcon name={navIconFor(item.label)} />
                      <span className="admin-sidebar__label">{item.label}</span>
                      {item.comingSoon ? (
                        <span className="admin-sidebar__badge">Soon</span>
                      ) : null}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

      </aside>

      <div className="admin-layout__main">
        <header className="admin-header">
          <div className="admin-header__start">
            <button
              type="button"
              className="admin-header__menu-button"
              aria-expanded={isMobileNavOpen}
              aria-controls={navId}
              onClick={() => setIsMobileNavOpen((open) => !open)}
            >
              Menu
            </button>
            <p className="admin-header__breadcrumb" aria-label="Breadcrumb">
              <AdminIcon name="home" size={16} />
              <span className="admin-header__crumb">Admin</span>
              <span className="admin-header__crumb-sep" aria-hidden="true">
                /
              </span>
              <span className="admin-header__title">{currentLabel}</span>
            </p>
          </div>

          <div className="admin-header__search">
            <AdminIcon name="search" size={16} />
            <input
              type="search"
              className="admin-header__search-input"
              placeholder="Search products, users, orders..."
              aria-label="Search (coming soon)"
              disabled
            />
            <kbd className="admin-header__kbd">Ctrl K</kbd>
          </div>

          <div className="admin-header__actions">
            <button
              type="button"
              className="admin-header__icon-button"
              aria-label="Notifications (coming soon)"
              disabled
            >
              <AdminIcon name="bell" size={18} />
            </button>
            {user?.full_name ? (
              <div className="admin-header__profile">
                <span className="admin-header__avatar" aria-hidden="true">
                  {user.full_name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="admin-header__profile-text">
                  <span className="admin-header__user" aria-label="Signed in administrator">
                    {user.full_name}
                  </span>
                  <span className="admin-header__role">{user.role}</span>
                </span>
              </div>
            ) : null}
            <Button
              variant="secondary"
              isLoading={isSigningOut}
              onClick={() => signOut()}
            >
              Sign out
            </Button>
          </div>
        </header>

        <div className="admin-layout__content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
