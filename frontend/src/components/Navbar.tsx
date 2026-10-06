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
  const isModelsRoute = currentPath.startsWith('/3d-models')
  const isProductRoute = currentPath === '/products' || currentPath.startsWith('/products/')
  // `/` redirects to the marketplace home hub. Keep the branded nav on both
  // so the header does not flash the inner-page style before the redirect.
  const isMarketplaceHome = currentPath === '/' || currentPath === '/home'
  const isHomeHub = currentPath === '/home'
  const isCompactNav = useMediaQuery('(max-width: 1200px)')
  const searchParams = new URLSearchParams(location.search)
  const categoryFromUrl = searchParams.get('category')?.trim() ?? ''
  const searchFromUrl = searchParams.get('search')?.trim() ?? ''

  const [categoryId, setCategoryId] = useState(categoryFromUrl)
  const [searchInput, setSearchInput] = useState(searchFromUrl)
  const [accountOpen, setAccountOpen] = useState(false)
  const [exploreOpen, setExploreOpen] = useState(false)
  const [searchCatOpen, setSearchCatOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [drawerMenuOpen, setDrawerMenuOpen] = useState(true)
  const [drawerExploreOpen, setDrawerExploreOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const exploreRef = useRef<HTMLDivElement>(null)
  const searchCatRef = useRef<HTMLDivElement>(null)
  const exploreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchCatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleExploreMouseEnter = () => {
    if (exploreTimerRef.current) {
      clearTimeout(exploreTimerRef.current)
      exploreTimerRef.current = null
    }
    setExploreOpen(true)
  }

  const handleExploreMouseLeave = () => {
    exploreTimerRef.current = setTimeout(() => {
      setExploreOpen(false)
      exploreTimerRef.current = null
    }, 180)
  }

  const handleSearchCatMouseEnter = () => {
    if (searchCatTimerRef.current) {
      clearTimeout(searchCatTimerRef.current)
      searchCatTimerRef.current = null
    }
    setSearchCatOpen(true)
  }

  const handleSearchCatMouseLeave = () => {
    searchCatTimerRef.current = setTimeout(() => {
      setSearchCatOpen(false)
      searchCatTimerRef.current = null
    }, 180)
  }

  useEffect(() => {
    return () => {
      if (exploreTimerRef.current) {
        clearTimeout(exploreTimerRef.current)
      }
      if (searchCatTimerRef.current) {
        clearTimeout(searchCatTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (exploreTimerRef.current) {
      clearTimeout(exploreTimerRef.current)
      exploreTimerRef.current = null
    }
    if (searchCatTimerRef.current) {
      clearTimeout(searchCatTimerRef.current)
      searchCatTimerRef.current = null
    }
    setAccountOpen(false)
    setExploreOpen(false)
    setSearchCatOpen(false)
    setMobileNavOpen(false)
    setCategoryId(categoryFromUrl)
    setSearchInput(searchFromUrl)
  }, [location.pathname, location.search])

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

  // Keep Explore/search menus compact: top-level categories only, excluding
  // the internal demo category from customer-facing navigation.
  const exploreCategories = categories.filter((category) => {
    if (category.slug === 'demo-assets' || category.name.trim().toLowerCase() === 'demo assets') {
      return false
    }
    if ('parent' in category) {
      return category.parent == null
    }
    return true
  })
  const AllCategoriesIcon = getAllCategoriesIcon()
  const selectedSearchCategory = exploreCategories.find((cat) => cat.id === categoryId)
  const categoryHasChildren = (categoryIdToCheck: string) =>
    categories.some(
      (category) =>
        'parent' in category && category.parent != null && category.parent.id === categoryIdToCheck,
    )
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

  const handleSelectCategory = (newCatId: string) => {
    setCategoryId(newCatId)
    setSearchCatOpen(false)
    setExploreOpen(false)

    const targetPath = isPluginsRoute ? '/plugins' : '/3d-models'
    const nextParams = new URLSearchParams()
    if (newCatId) {
      nextParams.set('category', newCatId)
      if (!isPluginsRoute) {
        trackCategoryClick(newCatId)
      }
    }
    const query = searchInput.trim().slice(0, 100)
    if (query) {
      nextParams.set('search', query)
    }
    const qs = nextParams.toString()
    navigate(qs ? `${targetPath}?${qs}` : targetPath)
  }

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
          width="22"
          height="22"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 3h3.2l2.4 11.5a1.5 1.5 0 0 0 1.5 1.2h8.8a1.5 1.5 0 0 0 1.5-1.2L22 6.5H6.2" />
          <path d="M10 6.5v8" />
          <path d="M14 6.5v8" />
          <path d="M18 6.5v6" />
          <circle cx="9" cy="20.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="18" cy="20.5" r="1.5" fill="currentColor" stroke="none" />
        </svg>
        {(cartCountQuery.data ?? 0) > 0 ? (
          <span
            className="navbar__cart-badge"
            aria-label={`${cartCountQuery.data} item${cartCountQuery.data === 1 ? '' : 's'} in cart`}
          >
            {formatUnreadBadge(cartCountQuery.data ?? 0)}
          </span>
        ) : null}
      </button>
    ) : null

  return (
    <header
      className={`navbar${isMarketplaceHome ? ' navbar--marketplace-home' : ''}${isModelsRoute ? ' navbar--models' : ''}${isProductRoute ? ' navbar--products' : ''}${isPluginsRoute ? ' navbar--plugins' : ''}${mobileNavOpen ? ' navbar--mobile-open' : ''
        }`}
    >
      <nav className="navbar__inner" aria-label="Main">
        <div className="navbar__start">
          <Link className="navbar__brand" to="/home" onClick={closeMobileNav} aria-label="AssetHive 3D">
            <img
              src="/images/AssetHive%203D.svg"
              alt="AssetHive 3D"
              className="navbar__brand-logo"
            />
          </Link>

          {isMarketplaceHome && !isCompactNav ? (
            <div
              className="navbar__explore navbar__explore--desktop"
              ref={exploreRef}
              onMouseEnter={handleExploreMouseEnter}
              onMouseLeave={handleExploreMouseLeave}
            >
              <button
                type="button"
                className="navbar__explore-trigger"
                aria-expanded={exploreOpen}
                aria-haspopup="menu"
                onClick={() => {
                  if (exploreTimerRef.current) {
                    clearTimeout(exploreTimerRef.current)
                    exploreTimerRef.current = null
                  }
                  setExploreOpen(true)
                }}
              >
                Explore
                <span className="navbar__explore-trigger-chevron" aria-hidden="true" />
              </button>
              {exploreOpen ? (
                <div
                  className="navbar__explore-menu"
                  role="menu"
                  aria-label="Explore categories"
                  onMouseEnter={handleExploreMouseEnter}
                  onMouseLeave={handleExploreMouseLeave}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={`navbar__explore-item${categoryId === '' ? ' navbar__explore-item--active' : ''}`}
                    onClick={() => handleSelectCategory('')}
                  >
                    <AllCategoriesIcon className="navbar__explore-icon navbar__explore-icon--all" />
                    <span className="navbar__explore-label">All Categories</span>
                    <span className="navbar__explore-chevron" aria-hidden="true">›</span>
                  </button>
                  {exploreCategories.map((category) => {
                    const Icon = getCategoryIcon(category.slug)
                    return (
                      <button
                        type="button"
                        role="menuitem"
                        className={`navbar__explore-item${categoryId === category.id ? ' navbar__explore-item--active' : ''}`}
                        key={category.id}
                        onClick={() => handleSelectCategory(category.id)}
                      >
                        {category.image ? (
                          <img className="navbar__explore-image" src={category.image} alt="" />
                        ) : (
                          <Icon className={`navbar__explore-icon navbar__explore-icon--${category.slug}`} />
                        )}
                        <span className="navbar__explore-label">{category.name}</span>
                        {categoryHasChildren(category.id) ? (
                          <span className="navbar__explore-chevron" aria-hidden="true">›</span>
                        ) : null}
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
            <div
              className="navbar__search-cat"
              ref={searchCatRef}
              onMouseEnter={handleSearchCatMouseEnter}
              onMouseLeave={handleSearchCatMouseLeave}
            >
              <button
                type="button"
                id="navbar-category-select"
                className="navbar__search-cat-trigger"
                aria-expanded={searchCatOpen}
                aria-haspopup="menu"
                aria-label={searchCatLabel}
                onClick={() => setSearchCatOpen(true)}
              >
                <span className="navbar__search-cat-trigger-label">{searchCatLabel}</span>
                <span className="navbar__search-cat-trigger-chevron" aria-hidden="true" />
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
                    onClick={() => handleSelectCategory('')}
                  >
                    <AllCategoriesIcon className="navbar__explore-icon navbar__explore-icon--all" />
                    <span className="navbar__explore-label">All Categories</span>
                    <span className="navbar__explore-chevron" aria-hidden="true">›</span>
                  </button>
                  {exploreCategories.map((category) => {
                    const Icon = getCategoryIcon(category.slug)
                    return (
                      <button
                        type="button"
                        role="menuitem"
                        className={`navbar__explore-item${categoryId === category.id ? ' navbar__explore-item--active' : ''
                          }`}
                        key={category.id}
                        onClick={() => handleSelectCategory(category.id)}
                      >
                        {'image' in category && category.image ? (
                          <img
                            className="navbar__explore-image"
                            src={category.image}
                            alt=""
                          />
                        ) : (
                          <Icon className={`navbar__explore-icon navbar__explore-icon--${category.slug}`} />
                        )}
                        <span className="navbar__explore-label">{category.name}</span>
                        {categoryHasChildren(category.id) ? (
                          <span className="navbar__explore-chevron" aria-hidden="true">›</span>
                        ) : null}
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
              <Link
                className={`navbar__link${isModelsRoute ? ' navbar__link--active' : ''}`}
                to="/3d-models"
                aria-current={isModelsRoute ? 'page' : undefined}
              >
                3D Model
              </Link>
              <Link
                className={`navbar__link${isPluginsRoute ? ' navbar__link--active' : ''}`}
                to="/plugins"
                aria-current={isPluginsRoute ? 'page' : undefined}
              >
                Plugins
              </Link>
              <Link
                className={`navbar__link${currentPath.startsWith('/custom-projects') ? ' navbar__link--active' : ''}`}
                to="/custom-projects"
                aria-current={currentPath.startsWith('/custom-projects') ? 'page' : undefined}
              >
                Custom Projects
              </Link>
              <Link
                className={`navbar__link${currentPath === '/about' ? ' navbar__link--active' : ''}`}
                to="/about"
                aria-current={currentPath === '/about' ? 'page' : undefined}
              >
                About
              </Link>
              <Link
                className={`navbar__link${currentPath === '/contact' ? ' navbar__link--active' : ''}`}
                to="/contact"
                aria-current={currentPath === '/contact' ? 'page' : undefined}
              >
                Contact
              </Link>
            </div>

            <div
              className={`navbar__account-actions${!isAuthenticated ? ' navbar__account-actions--guest' : ''
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
                        <div className="navbar__account-menu-header">
                          {user?.avatar ? (
                            <img className="navbar__account-menu-avatar" src={user.avatar} alt="" />
                          ) : (
                            <span className="navbar__account-menu-avatar" aria-hidden="true" />
                          )}
                          <div className="navbar__account-menu-identity">
                            <strong>{user?.full_name || firstName}</strong>
                            <span>{user?.email}</span>
                          </div>
                        </div>
                        <div className="navbar__account-menu-links">
                        {isAdministrator(user?.role) ? (
                          <>
                            <Link
                              role="menuitem"
                              className={`navbar__account-item${currentPath === '/console' ? ' navbar__account-item--active' : ''}`}
                              to="/console"
                              onClick={() => setAccountOpen(false)}
                            >
                              <span className="navbar__account-item-icon navbar__account-item-icon--grid" aria-hidden="true" />
                              Admin
                            </Link>
                            <Link
                              role="menuitem"
                              className={`navbar__account-item${currentPath === '/profile' ? ' navbar__account-item--active' : ''}`}
                              to="/profile"
                              onClick={() => setAccountOpen(false)}
                            >
                              <span className="navbar__account-item-icon navbar__account-item-icon--profile" aria-hidden="true" />
                              Profile
                            </Link>
                          </>
                        ) : (
                          <>
                            <Link
                              role="menuitem"
                              className={`navbar__account-item${currentPath === '/dashboard' ? ' navbar__account-item--active' : ''}`}
                              to="/dashboard"
                              onClick={() => setAccountOpen(false)}
                            >
                              <span className="navbar__account-item-icon navbar__account-item-icon--grid" aria-hidden="true" />
                              Dashboard
                            </Link>
                            <Link
                              role="menuitem"
                              className={`navbar__account-item${currentPath === '/profile' ? ' navbar__account-item--active' : ''}`}
                              to="/profile"
                              onClick={() => setAccountOpen(false)}
                            >
                              <span className="navbar__account-item-icon navbar__account-item-icon--profile" aria-hidden="true" />
                              Profile
                            </Link>
                          </>
                        )}
                        </div>
                        <div className="navbar__account-menu-signout">
                        <button
                          type="button"
                          role="menuitem"
                          className="navbar__account-item navbar__account-item--button"
                          disabled={logoutMutation.isPending}
                          onClick={() => logoutMutation.mutate()}
                        >
                          <span className="navbar__account-item-icon navbar__account-item-icon--signout" aria-hidden="true" />
                          Sign out
                        </button>
                        </div>
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
                      {isMarketplaceHome ? 'Log in' : 'Sign in'}
                    </AuthEntryButton>
                    <span className="navbar__guest-auth-divider" aria-hidden="true" />
                    <AuthEntryButton
                      mode="register"
                      returnTo={location.pathname}
                      className="navbar__link navbar__link--primary"
                    >
                      {isMarketplaceHome ? 'Sign up' : 'Register'}
                    </AuthEntryButton>
                  </div>
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
          {/* Top Header & Auth Section (matches Image 2) */}
          <div className="navbar__drawer-top">
            <div className="navbar__drawer-top-header">
              <Link to="/home" onClick={closeMobileNav} className="navbar__drawer-brand-link">
                <img
                  src="/images/AssetHive%203D.svg"
                  alt="AssetHive 3D"
                  className="navbar__drawer-brand-logo"
                />
              </Link>
              <button
                type="button"
                className="navbar__drawer-close"
                aria-label="Close menu"
                onClick={closeMobileNav}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {isAuthenticated ? (
              <div className="navbar__drawer-user">
                <div className="navbar__drawer-user-info">
                  {user?.avatar ? (
                    <img className="navbar__account-avatar" src={user.avatar} alt="" />
                  ) : (
                    <span className="navbar__account-avatar" />
                  )}
                  <span className="navbar__drawer-user-name">Hi, {firstName}</span>
                </div>
                <div className="navbar__drawer-auth-buttons">
                  {isAdministrator(user?.role) ? (
                    <Link className="navbar__drawer-btn navbar__drawer-btn--subtle" to="/console" onClick={closeMobileNav}>
                      ADMIN
                    </Link>
                  ) : (
                    <Link className="navbar__drawer-btn navbar__drawer-btn--subtle" to="/dashboard" onClick={closeMobileNav}>
                      DASHBOARD
                    </Link>
                  )}
                  <Link className="navbar__drawer-btn navbar__drawer-btn--subtle" to="/profile" onClick={closeMobileNav}>
                    PROFILE
                  </Link>
                  <button
                    type="button"
                    className="navbar__drawer-btn navbar__drawer-btn--signup"
                    disabled={logoutMutation.isPending}
                    onClick={() => {
                      closeMobileNav()
                      logoutMutation.mutate()
                    }}
                  >
                    {logoutMutation.isPending ? 'SIGNING OUT…' : 'SIGN OUT'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="navbar__drawer-auth-buttons">
                <AuthEntryButton
                  mode="login"
                  returnTo={location.pathname}
                  className="navbar__drawer-btn navbar__drawer-btn--login"
                  data-testid="mobile-drawer-login-btn"
                  onClick={closeMobileNav}
                >
                  LOGIN
                </AuthEntryButton>
                <AuthEntryButton
                  mode="register"
                  returnTo={location.pathname}
                  className="navbar__drawer-btn navbar__drawer-btn--signup"
                  data-testid="mobile-drawer-signup-btn"
                  onClick={closeMobileNav}
                >
                  SIGN UP
                </AuthEntryButton>
              </div>
            )}
          </div>

          {/* Drawer Menu & Explore Accordions */}
          <div className="navbar__drawer-body">
            {/* Menu Dropdown Accordion */}
            <div className={`navbar__drawer-accordion${drawerMenuOpen ? ' navbar__drawer-accordion--open' : ''}`}>
              <button
                type="button"
                className="navbar__drawer-accordion-trigger"
                aria-expanded={drawerMenuOpen}
                onClick={() => setDrawerMenuOpen((open) => !open)}
              >
                <span>MENU</span>
                <svg
                  className={`navbar__drawer-chevron${drawerMenuOpen ? ' navbar__drawer-chevron--open' : ''}`}
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>
              {drawerMenuOpen ? (
                <nav className="navbar__drawer-subnav" aria-label="Menu links">
                  <Link className="navbar__drawer-sublink" to="/home" onClick={closeMobileNav}>
                    Home
                  </Link>
                  <Link className="navbar__drawer-sublink" to="/3d-models" onClick={closeMobileNav}>
                    3D model
                  </Link>
                  <Link className="navbar__drawer-sublink" to="/plugins" onClick={closeMobileNav}>
                    Plugin
                  </Link>
                  <Link className="navbar__drawer-sublink" to="/custom-projects" onClick={closeMobileNav}>
                    Custom project
                  </Link>
                  <div className="navbar__drawer-subdivider" role="separator" />
                  <Link className="navbar__drawer-sublink" to="/about" onClick={closeMobileNav}>
                    About
                  </Link>
                  <Link className="navbar__drawer-sublink" to="/contact" onClick={closeMobileNav}>
                    Contact
                  </Link>
                </nav>
              ) : null}
            </div>

            {/* Explore Dropdown Accordion */}
            <div className={`navbar__drawer-accordion${drawerExploreOpen ? ' navbar__drawer-accordion--open' : ''}`}>
              <button
                type="button"
                className="navbar__drawer-accordion-trigger"
                aria-expanded={drawerExploreOpen}
                onClick={() => setDrawerExploreOpen((open) => !open)}
              >
                <span>EXPLORE</span>
                <svg
                  className={`navbar__drawer-chevron${drawerExploreOpen ? ' navbar__drawer-chevron--open' : ''}`}
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>
              {drawerExploreOpen ? (
                <div className="navbar__drawer-subnav navbar__drawer-subnav--explore">
                  <button
                    type="button"
                    className="navbar__drawer-sublink navbar__drawer-sublink--button"
                    onClick={() => {
                      closeMobileNav()
                      handleSelectCategory('')
                    }}
                  >
                    <AllCategoriesIcon className="navbar__drawer-cat-icon" />
                    <span>All Categories</span>
                  </button>
                  {exploreCategories.map((category) => {
                    const Icon = getCategoryIcon(category.slug)
                    return (
                      <button
                        type="button"
                        className="navbar__drawer-sublink navbar__drawer-sublink--button"
                        key={category.id}
                        onClick={() => {
                          closeMobileNav()
                          handleSelectCategory(category.id)
                        }}
                      >
                        {'image' in category && category.image ? (
                          <img className="navbar__drawer-cat-image" src={category.image} alt="" />
                        ) : (
                          <Icon className="navbar__drawer-cat-icon" />
                        )}
                        <span>{category.name}</span>
                      </button>
                    )
                  })}
                  {(isPluginsRoute ? pluginCategoriesQuery.isLoading : productCategoriesQuery.isLoading) ? (
                    <p className="navbar__drawer-status">Loading categories…</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}
