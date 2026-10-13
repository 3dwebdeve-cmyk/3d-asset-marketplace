import { useEffect, useId, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { logoutUser } from '../api/authApi'
import { dashboardNavItems, type DashboardNavIcon } from '../config/dashboardNav'
import { useDocumentSeo } from '../hooks/useDocumentSeo'
import { useNotFoundChrome } from '../hooks/useNotFoundChrome'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import '../styles/dashboard-layout.css'
import '../styles/dashboard-list.css'
import '../styles/dashboard-home.css'
import '../styles/dashboard-project-form.css'
import '../styles/dashboard-profile.css'

function NavIcon({ name }: { name: DashboardNavIcon }) {
  switch (name) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5.5v-6h-3v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      )
    case 'wishlist':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20s-7-4.35-9-8.5C1.5 8.2 3.4 5 6.8 5c1.8 0 3.1 1 3.9 2 .8-1 2.1-2 3.9-2C18.6 5 20.5 8.2 19 11.5 17 15.65 12 20 12 20Z" />
        </svg>
      )
    case 'orders':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 4h8a2 2 0 0 1 2 2v14l-3-1.5L12 20l-3-1.5L6 20V6a2 2 0 0 1 2-2Z" />
          <path d="M9 9h6M9 13h6" />
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
    default:
      return null
  }
}

function isNavItemActive(pathname: string, to: string, end?: boolean): boolean {
  if (end) {
    return pathname === to
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function DashboardLayout() {
  const navId = useId()
  const location = useLocation()
  const navigate = useNavigate()
  const clearSession = useAuthStore((state) => state.clearSession)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const { isNotFound } = useNotFoundChrome()

  useDocumentSeo({
    title: 'Dashboard | 3D HUB',
    description: 'Manage your orders, downloads, and account.',
    robots: 'noindex, nofollow',
  })

  useEffect(() => {
    setIsMobileNavOpen(false)
  }, [location.pathname])

  const logoutMutation = useMutation({
    mutationFn: () => logoutUser(),
    onSettled: () => {
      clearSession({ redirectTo: '/' })
      toast.success('Signed out')
      navigate('/', { replace: true })
    },
  })

  if (isNotFound) {
    return <Outlet />
  }

  return (
    <div className="dashboard-layout">
      {isMobileNavOpen ? (
        <button
          type="button"
          className="dashboard-layout__overlay"
          aria-label="Close navigation menu"
          onClick={() => setIsMobileNavOpen(false)}
        />
      ) : null}

      <aside
        className={`dashboard-sidebar${isMobileNavOpen ? ' dashboard-sidebar--open' : ''}`}
        aria-label="Customer dashboard"
      >
        <Link
          className="dashboard-sidebar__cta"
          to="/contact?enquiryType=Custom%203D%20Modeling"
          onClick={() => setIsMobileNavOpen(false)}
        >
          <span className="dashboard-sidebar__cta-icon" aria-hidden="true">
            +
          </span>
          Request a custom project
        </Link>

        <nav id={navId} className="dashboard-sidebar__nav" aria-label="Dashboard sections">
          <ul className="dashboard-sidebar__list">
            {dashboardNavItems.map((item) => {
              const active = isNavItemActive(location.pathname, item.to, item.end)
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={`dashboard-sidebar__link${active ? ' dashboard-sidebar__link--active' : ''}`}
                    onClick={() => setIsMobileNavOpen(false)}
                  >
                    <NavIcon name={item.icon} />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              )
            })}
            <li>
              <button
                type="button"
                className="dashboard-sidebar__signout"
                disabled={logoutMutation.isPending}
                onClick={() => logoutMutation.mutate()}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
                  <path d="M16 12H8" />
                  <path d="m13 8 4 4-4 4" />
                </svg>
                <span>{logoutMutation.isPending ? 'Signing out…' : 'Sign out'}</span>
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      <div className="dashboard-layout__main">
        <header className="dashboard-header">
          <button
            type="button"
            className="dashboard-header__menu-button"
            aria-expanded={isMobileNavOpen}
            aria-controls={navId}
            onClick={() => setIsMobileNavOpen((open) => !open)}
          >
            Menu
          </button>
        </header>

        <div className="dashboard-layout__content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
