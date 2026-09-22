import { useEffect, useId, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

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
    title: 'Admin console | 3D Asset Marketplace',
    description: 'Private administrator control panel.',
    robots: 'noindex, nofollow',
  })

  useEffect(() => {
    setIsMobileNavOpen(false)
  }, [location.pathname])

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
          <p className="admin-sidebar__eyebrow">Administrator</p>
          <p className="admin-sidebar__title">Control panel</p>
        </div>

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
                      {item.label}
                    </NavLink>
                  ) : (
                    <span
                      className="admin-sidebar__link admin-sidebar__link--disabled"
                      aria-disabled="true"
                    >
                      {item.label}
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
            <p className="admin-header__title">Admin panel</p>
          </div>

          <div className="admin-header__actions">
            {user?.full_name ? (
              <span className="admin-header__user" aria-label="Signed in administrator">
                {user.full_name}
              </span>
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
