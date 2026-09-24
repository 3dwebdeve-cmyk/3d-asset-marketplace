import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { logoutUser } from '../api/authApi'
import { getCart } from '../api/cartApi'
import { listPublicCategories } from '../api/categoriesApi'
import { listPublicPluginCategories } from '../api/pluginsApi'
import { AuthEntryButton } from './auth/AuthEntryButton'
import { getAllCategoriesIcon, getCategoryIcon } from './categoryIcons'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { isAdministrator } from '../lib/roles'
import { trackCategoryClick } from '../lib/trackCategoryClick'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import { useCartUiStore } from '../store/cartUiStore'

function formatUnreadBadge(count: number): string {
  if (count > 99) return '99+'
  return String(count)
}

export function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const mobileNavId = useId()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const clearSession = useAuthStore((state) => state.clearSession)
  const openCartDrawer = useCartUiStore((state) => state.openDrawer)

  const currentPath = location.pathname.toLowerCase()
  const isPluginsRoute = currentPath.startsWith('/plugins')
  // `/` redirects to the marketplace home hub. Keep the branded nav on both
  // so the header does not flash the inner-page style before the redirect.
  const isMarketplaceHome = currentPath === '/' || currentPath === '/home'
  const isHomeHub = currentPath === '/home'
  const isCompactNav = useMediaQuery('(max-width: 900px)')
  const [categoryId, setCategoryId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [accountOpen, setAccountOpen] = useState(false)
  const [exploreOpen, setExploreOpen] = useState(false)
  const [searchCatOpen, setSearchCatOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const exploreRef = useRef<HTMLDivElement>(null)
  const searchCatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAccountOpen(false)
    setExploreOpen(false)
    setSearchCatOpen(false)
    setMobileNavOpen(false)
    setCategoryId('')
    setSearchInput('')
  }, [location.pathname])

  useEffect(() => {
    if (!isCompactNav) {
      setMobileNavOpen(false)
    }
  }, [isCompactNav])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false)
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileNavOpen])

  useEffect(() => {
    if (!accountOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [accountOpen])

  useEffect(() => {
    if (!exploreOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!exploreRef.current?.contains(event.target as Node)) {
        setExploreOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExploreOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [exploreOpen])

  useEffect(() => {
    if (!searchCatOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!searchCatRef.current?.contains(event.target as Node)) {
        setSearchCatOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchCatOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [searchCatOpen])

  const productCategoriesQuery = useQuery({
    queryKey: ['public-categories-list', { page_size: 100 }],
    queryFn: () => listPublicCategories({ page_size: 100 }),
    staleTime: 1000 * 60 * 5,
    enabled: !isPluginsRoute,
  })

  const pluginCategoriesQuery = useQuery({
    queryKey: ['public-plugin-categories-list', { page_size: 100, is_active: true }],
    queryFn: () => listPublicPluginCategories({ page_size: 100, is_active: true }),
    staleTime: 1000 * 60 * 5,
    enabled: isPluginsRoute,
  })

  const categories = isPluginsRoute
    ? (pluginCategoriesQuery.data?.results ?? [])
    : (productCategoriesQuery.data?.results ?? [])

  // Keep Explore/search menus compact: top-level categories only.
  const exploreCategories = categories.filter((category) => {
    if ('parent' in category) {
      return category.parent == null
    }
    return true
  })
  const AllCategoriesIcon = getAllCategoriesIcon()
  const selectedSearchCategory = exploreCategories.find((cat) => cat.id === categoryId)
  const searchCatLabel = selectedSearchCategory?.name ?? 'All Categories'
  const searchCategoriesLoading = isPluginsRoute
    ? pluginCategoriesQuery.isLoading
    : productCategoriesQuery.isLoading
  const searchCategoriesError = isPluginsRoute
    ? pluginCategoriesQuery.isError
    : productCategoriesQuery.isError

  const cartCountQuery = useQuery({
    queryKey: ['cart'],
    queryFn: getCart,
    enabled: isAuthenticated && !isAdministrator(user?.role),
    select: (data) => data.total_quantity,
  })

  const logoutMutation = useMutation({
    mutationFn: () => logoutUser(),
    onSettled: () => {
      clearSession({ redirectTo: '/home' })
      toast.success('Signed out')
      navigate('/home', { replace: true })
    },
  })

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault()
    const params = new URLSearchParams()
    const query = searchInput.trim().slice(0, 100)
    if (query) params.set('search', query)
    if (categoryId) {
      params.set('category', categoryId)
      if (!isPluginsRoute) {
        trackCategoryClick(categoryId)
      }
    }
    const path = isPluginsRoute ? '/plugins' : '/3d-models'
    const qs = params.toString()
    navigate(qs ? `${path}?${qs}` : path)
  }

  const closeMobileNav = () => setMobileNavOpen(false)

  const firstName = user?.full_name?.trim().split(/\s+/)[0] || 'User'
  const showCartButton = isAuthenticated && !isAdministrator(user?.role)

  const renderCartButton = (className = '') =>
    showCartButton ? (
      <button
        type="button"
        className={`navbar__icon-btn navbar__cart-button${className ? ` ${className}` : ''}`}
        onClick={() => {
          closeMobileNav()
          openCartDrawer()
        }}
        aria-label="Cart"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M6 6h15l-1.5 9h-12z" />
          <path d="M6 6l-1-3H2" />
          <circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="18" cy="20" r="1.2" fill="currentColor" stroke="none" />
        </svg>
        {(cartCountQuery.data ?? 0) > 0 ? (
          <span
            className="project-unread-badge navbar__cart-badge"
            aria-label={`${cartCountQuery.data} item${cartCountQuery.data === 1 ? '' : 's'} in cart`}
          >
            {formatUnreadBadge(cartCountQuery.data ?? 0)}
          </span>
        ) : null}
      </button>
    ) : null

  return (
    <header
      className={`navbar${isMarketplaceHome ? ' navbar--marketplace-home' : ''}${
        mobileNavOpen ? ' navbar--mobile-open' : ''
      }`}
    >
      <nav className="navbar__inner" aria-label="Main">
        <div className="navbar__start">
          <Link className="navbar__brand" to="/home" onClick={closeMobileNav}>
            3D HUB
          </Link>

          {isMarketplaceHome && !isCompactNav ? (
            <div className="navbar__explore navbar__explore--desktop" ref={exploreRef}>
              <button
                type="button"
                className="navbar__explore-trigger"
                aria-expanded={exploreOpen}
                aria-haspopup="menu"
                onClick={() => setExploreOpen((open) => !open)}
              >
                Explore
                <span aria-hidden="true">⌄</span>
              </button>
              {exploreOpen ? (
                <div className="navbar__explore-menu" role="menu" aria-label="Explore categories">
                  <button
                    type="button"
                    role="menuitem"
                    className="navbar__explore-item"
                    onClick={() => {
                      setExploreOpen(false)
                      navigate('/3d-models')
                    }}
                  >
                    <AllCategoriesIcon className="navbar__explore-icon" />
                    <span className="navbar__explore-label">All Categories</span>
                  </button>
                  {exploreCategories.map((category) => {
                    const Icon = getCategoryIcon(category.slug)
                    return (
                      <button
                        type="button"
                        role="menuitem"
                        className="navbar__explore-item"
                        key={category.id}
                        onClick={() => {
                          setExploreOpen(false)
                          trackCategoryClick(category.id)
                          navigate(`/3d-models?category=${encodeURIComponent(category.id)}`)
                        }}
                      >
                        {category.image ? (
                          <img className="navbar__explore-image" src={category.image} alt="" />
                        ) : (
                          <Icon className="navbar__explore-icon" />
                        )}
                        <span className="navbar__explore-label">{category.name}</span>
                      </button>
                    )
                  })}
                  {productCategoriesQuery.isLoading ? (
                    <p className="navbar__explore-status">Loading categories…</p>
                  ) : null}
                  {productCategoriesQuery.isError ? (
                    <p className="navbar__explore-status">Categories could not be loaded.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {!isMarketplaceHome ? (
          <form className="navbar__search" onSubmit={handleSearchSubmit} role="search">
            <div className="navbar__search-cat" ref={searchCatRef}>
              <button
                type="button"
                id="navbar-category-select"
                className="navbar__search-cat-trigger"
                aria-expanded={searchCatOpen}
                aria-haspopup="menu"
                aria-label="All Categories"
                onClick={() => setSearchCatOpen((open) => !open)}
              >
                <span className="navbar__search-cat-trigger-label">{searchCatLabel}</span>
                <span aria-hidden="true">⌄</span>
              </button>
              {searchCatOpen ? (
                <div
                  className="navbar__explore-menu navbar__search-cat-menu"
                  role="menu"
                  aria-label="Search categories"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={`navbar__explore-item${categoryId === '' ? ' navbar__explore-item--active' : ''}`}
                    onClick={() => {
                      setCategoryId('')
                      setSearchCatOpen(false)
                    }}
                  >
                    <AllCategoriesIcon className="navbar__explore-icon" />
                    <span className="navbar__explore-label">All Categories</span>
                  </button>
                  {exploreCategories.map((category) => {
                    const Icon = getCategoryIcon(category.slug)
                    return (
                      <button
                        type="button"
                        role="menuitem"
                        className={`navbar__explore-item${
                          categoryId === category.id ? ' navbar__explore-item--active' : ''
                        }`}
                        key={category.id}
                        onClick={() => {
                          setCategoryId(category.id)
                          setSearchCatOpen(false)
                        }}
                      >
                        {'image' in category && category.image ? (
                          <img
                            className="navbar__explore-image"
                            src={category.image}
                            alt=""
                          />
                        ) : (
                          <Icon className="navbar__explore-icon" />
                        )}
                        <span className="navbar__explore-label">{category.name}</span>
                      </button>
                    )
                  })}
                  {searchCategoriesLoading ? (
                    <p className="navbar__explore-status">Loading categories…</p>
                  ) : null}
                  {searchCategoriesError ? (
                    <p className="navbar__explore-status">Categories could not be loaded.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <input
              type="search"
              className="navbar__search-input"
              placeholder={isPluginsRoute ? 'Search plugins...' : 'Search 3D models...'}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label={isPluginsRoute ? 'Search plugins' : 'Search 3D models'}
            />
            <button type="submit" className="navbar__search-submit" aria-label="Search">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </button>
          </form>
        ) : null}

        {isCompactNav ? (
          <div className="navbar__toolbar">
            {renderCartButton('navbar__cart-button--mobile')}
            <button
              type="button"
              className="navbar__menu-button"
              aria-expanded={mobileNavOpen}
              aria-controls={mobileNavId}
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <span className="navbar__menu-icon" aria-hidden="true">
                {mobileNavOpen ? (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                )}
              </span>
            </button>
          </div>
        ) : (
        <div className="navbar__actions navbar__actions--desktop">
          <div className="navbar__primary-links">
            <Link
              className="navbar__link"
              to="/home"
              aria-current={isHomeHub ? 'page' : undefined}
            >
              Home
            </Link>
            <Link className="navbar__link" to="/3d-models">
              3D Model
            </Link>
            <Link className="navbar__link" to="/plugins">
              Plugins
            </Link>
            <Link className="navbar__link" to="/custom-projects">
              Custom Projects
            </Link>
            <Link className="navbar__link" to="/about">
              About
            </Link>
            <Link className="navbar__link" to="/contact">
              Contact
            </Link>
          </div>

          <div
            className={`navbar__account-actions${
              !isAuthenticated ? ' navbar__account-actions--guest' : ''
            }`}
          >
            {isAuthenticated ? (
              <>
                {renderCartButton('navbar__cart-button--desktop')}

                <div className="navbar__account" ref={accountRef}>
                  <button
                    type="button"
                    className="navbar__account-trigger"
                    aria-label={`Hi, ${firstName}`}
                    aria-expanded={accountOpen}
                    aria-haspopup="menu"
                    onClick={() => setAccountOpen((open) => !open)}
                  >
                    {user?.avatar ? (
                      <img
                        className="navbar__account-avatar"
                        src={user.avatar}
                        alt=""
                        width={26}
                        height={26}
                      />
                    ) : (
                      <span className="navbar__account-avatar" aria-hidden="true" />
                    )}
                    <span>Hi, {firstName}</span>
                    <span className="navbar__account-caret" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {accountOpen ? (
                    <div className="navbar__account-menu" role="menu">
                      {isAdministrator(user?.role) ? (
                        <>
                          <Link
                            role="menuitem"
                            className="navbar__account-item"
                            to="/console"
                            onClick={() => setAccountOpen(false)}
                          >
                            Admin
                          </Link>
                          <Link
                            role="menuitem"
                            className="navbar__account-item"
                            to="/profile"
                            onClick={() => setAccountOpen(false)}
                          >
                            Profile
                          </Link>
                        </>
                      ) : (
                        <>
                          <Link
                            role="menuitem"
                            className="navbar__account-item"
                            to="/dashboard"
                            onClick={() => setAccountOpen(false)}
                          >
                            Dashboard
                          </Link>
                          <Link
                            role="menuitem"
                            className="navbar__account-item"
                            to="/profile"
                            onClick={() => setAccountOpen(false)}
                          >
                            Profile
                          </Link>
                        </>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        className="navbar__account-item navbar__account-item--button"
                        disabled={logoutMutation.isPending}
                        onClick={() => logoutMutation.mutate()}
                      >
                        Sign out
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="navbar__guest-auth-pill">
                  <AuthEntryButton
                    mode="login"
                    returnTo={location.pathname}
                    className="navbar__link"
                    data-testid="customer-login-trigger"
                  >
                    {isMarketplaceHome ? 'Login' : 'Sign in'}
                  </AuthEntryButton>
                  <AuthEntryButton
                    mode="register"
                    returnTo={location.pathname}
                    className="navbar__link navbar__link--primary"
                  >
                    {isMarketplaceHome ? 'Signup' : 'Register'}
                  </AuthEntryButton>
                </div>
                {isMarketplaceHome ? (
                  <>
                    <Link className="navbar__home-utility" to="/contact" aria-label="Messages">
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        aria-hidden="true"
                      >
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="m4 7 8 6 8-6" />
                      </svg>
                    </Link>
                    <AuthEntryButton
                      mode="login"
                      returnTo={location.pathname}
                      className="navbar__home-utility"
                      aria-label="Account"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="8" r="3" />
                        <path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" />
                      </svg>
                    </AuthEntryButton>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
        )}
      </nav>

      {isCompactNav && mobileNavOpen ? (
        <button
          type="button"
          className="navbar__mobile-overlay"
          aria-label="Close navigation menu"
          onClick={closeMobileNav}
        />
      ) : null}

      {isCompactNav ? (
      <div
        id={mobileNavId}
        className={`navbar__drawer${mobileNavOpen ? ' navbar__drawer--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        hidden={!mobileNavOpen}
      >
        <div className="navbar__drawer-header">
          <p className="navbar__drawer-title">Menu</p>
          <button
            type="button"
            className="navbar__drawer-close"
            aria-label="Close menu"
            onClick={closeMobileNav}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav className="navbar__drawer-nav" aria-label="Primary">
          <Link className="navbar__drawer-link" to="/home" onClick={closeMobileNav}>
            Home
          </Link>
          <Link className="navbar__drawer-link" to="/3d-models" onClick={closeMobileNav}>
            3D Model
          </Link>
          <Link className="navbar__drawer-link" to="/plugins" onClick={closeMobileNav}>
            Plugins
          </Link>
          <Link className="navbar__drawer-link" to="/custom-projects" onClick={closeMobileNav}>
            Custom Projects
          </Link>
          <Link className="navbar__drawer-link" to="/about" onClick={closeMobileNav}>
            About
          </Link>
          <Link className="navbar__drawer-link" to="/contact" onClick={closeMobileNav}>
            Contact
          </Link>
        </nav>

        <div className="navbar__drawer-section">
          <p className="navbar__drawer-section-title">Explore</p>
          <button
            type="button"
            className="navbar__drawer-link navbar__drawer-link--button"
            onClick={() => {
              closeMobileNav()
              navigate(isPluginsRoute ? '/plugins' : '/3d-models')
            }}
          >
            <AllCategoriesIcon className="navbar__explore-icon" />
            <span>All Categories</span>
          </button>
          {exploreCategories.map((category) => {
            const Icon = getCategoryIcon(category.slug)
            return (
              <button
                type="button"
                className="navbar__drawer-link navbar__drawer-link--button"
                key={category.id}
                onClick={() => {
                  closeMobileNav()
                  if (!isPluginsRoute) {
                    trackCategoryClick(category.id)
                    navigate(`/3d-models?category=${encodeURIComponent(category.id)}`)
                  } else {
                    navigate(`/plugins?category=${encodeURIComponent(category.id)}`)
                  }
                }}
              >
                {'image' in category && category.image ? (
                  <img className="navbar__explore-image" src={category.image} alt="" />
                ) : (
                  <Icon className="navbar__explore-icon" />
                )}
                <span>{category.name}</span>
              </button>
            )
          })}
          {(isPluginsRoute ? pluginCategoriesQuery.isLoading : productCategoriesQuery.isLoading) ? (
            <p className="navbar__explore-status">Loading categories…</p>
          ) : null}
        </div>

        <div className="navbar__drawer-section navbar__drawer-section--account">
          {isAuthenticated ? (
            <>
              {isAdministrator(user?.role) ? (
                <Link className="navbar__drawer-link" to="/console" onClick={closeMobileNav}>
                  Admin
                </Link>
              ) : (
                <Link className="navbar__drawer-link" to="/dashboard" onClick={closeMobileNav}>
                  Dashboard
                </Link>
              )}
              <Link className="navbar__drawer-link" to="/profile" onClick={closeMobileNav}>
                Profile
              </Link>
              <button
                type="button"
                className="navbar__drawer-link navbar__drawer-link--button"
                disabled={logoutMutation.isPending}
                onClick={() => logoutMutation.mutate()}
              >
                {logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
              </button>
            </>
          ) : (
            <div className="navbar__drawer-auth">
              <AuthEntryButton
                mode="login"
                returnTo={location.pathname}
                className="navbar__drawer-link"
                data-testid="customer-login-trigger"
                onClick={closeMobileNav}
              >
                Sign in
              </AuthEntryButton>
              <AuthEntryButton
                mode="register"
                returnTo={location.pathname}
                className="navbar__drawer-link navbar__link--primary"
                onClick={closeMobileNav}
              >
                Register
              </AuthEntryButton>
            </div>
          )}
        </div>
      </div>
      ) : null}
    </header>
  )
}
