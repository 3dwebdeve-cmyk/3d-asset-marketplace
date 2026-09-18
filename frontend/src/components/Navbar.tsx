import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { logoutUser } from '../api/authApi'
import { getCart } from '../api/cartApi'
import { listPublicCategories } from '../api/categoriesApi'
import { listPublicPluginCategories } from '../api/pluginsApi'
import { listWishlistItems } from '../api/wishlistApi'
import { AuthEntryButton } from './auth/AuthEntryButton'
import { isAdministrator } from '../lib/roles'
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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const clearSession = useAuthStore((state) => state.clearSession)
  const openCartDrawer = useCartUiStore((state) => state.openDrawer)

  const currentPath = location.pathname.toLowerCase()
  const isPluginsRoute = currentPath.startsWith('/plugins')
  // Landing (/) and marketplace home hub (/home) use the branded overlay nav.
  const isMarketplaceHome = currentPath === '/' || currentPath === '/home'
  const isHomeHub = currentPath === '/home'
  const [categoryId, setCategoryId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [accountOpen, setAccountOpen] = useState(false)
  const [exploreOpen, setExploreOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const exploreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAccountOpen(false)
    setExploreOpen(false)
    setCategoryId('')
    setSearchInput('')
  }, [location.pathname])

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

  const wishlistCountQuery = useQuery({
    queryKey: ['wishlist', 'count'],
    queryFn: () => listWishlistItems({ page: 1, page_size: 1 }),
    enabled: isAuthenticated && !isAdministrator(user?.role),
    select: (data) => data.count,
  })

  const cartCountQuery = useQuery({
    queryKey: ['cart'],
    queryFn: getCart,
    enabled: isAuthenticated && !isAdministrator(user?.role),
    select: (data) => data.total_quantity,
  })

  const logoutMutation = useMutation({
    mutationFn: () => logoutUser(),
    onSettled: () => {
      clearSession({ redirectTo: '/' })
      toast.success('Signed out')
      navigate('/', { replace: true })
    },
  })

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault()
    const params = new URLSearchParams()
    const query = searchInput.trim().slice(0, 100)
    if (query) params.set('search', query)
    if (categoryId) params.set('category', categoryId)
    const path = isPluginsRoute ? '/plugins' : '/3d-models'
    const qs = params.toString()
    navigate(qs ? `${path}?${qs}` : path)
  }

  const firstName = user?.full_name?.trim().split(/\s+/)[0] || 'User'

  return (
    <header className={`navbar${isMarketplaceHome ? ' navbar--marketplace-home' : ''}`}>
      <nav className="navbar__inner" aria-label="Main">
        <div className="navbar__start">
          <Link className="navbar__brand" to="/">
            3D HUB
          </Link>

          {isMarketplaceHome ? (
            <>
              <div className="navbar__explore" ref={exploreRef}>
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
                      <span className="navbar__explore-badge" aria-hidden="true">
                        ◫
                      </span>
                      All Categories
                    </button>
                    {categories.map((category) => (
                      <button
                        type="button"
                        role="menuitem"
                        className="navbar__explore-item"
                        key={category.id}
                        onClick={() => {
                          setExploreOpen(false)
                          navigate(`/3d-models?category=${encodeURIComponent(category.id)}`)
                        }}
                      >
                        {category.image ? (
                          <img
                            className="navbar__explore-image"
                            src={category.image}
                            alt=""
                          />
                        ) : (
                          <span className="navbar__explore-badge" aria-hidden="true">
                            {category.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        {category.name}
                      </button>
                    ))}
                    {productCategoriesQuery.isLoading ? (
                      <p className="navbar__explore-status">Loading categories…</p>
                    ) : null}
                    {productCategoriesQuery.isError ? (
                      <p className="navbar__explore-status">Categories could not be loaded.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        {!isMarketplaceHome ? (
          <form className="navbar__search" onSubmit={handleSearchSubmit} role="search">
            <label className="navbar__search-cat-label" htmlFor="navbar-category-select">
              <span className="visually-hidden">All Categories</span>
              <select
                id="navbar-category-select"
                className="navbar__search-cat"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                aria-label="All Categories"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
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

        <div className="navbar__actions">
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
            <Link className="navbar__link navbar__link--muted" to="/about">
              About
            </Link>
            <Link className="navbar__link navbar__link--muted" to="/contact">
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
              {isAdministrator(user?.role) ? null : (
                <>
                  <button
                    type="button"
                    className="navbar__icon-btn navbar__cart-button"
                    onClick={openCartDrawer}
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
                </>
              )}

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
                          to="/dashboard/projects"
                          onClick={() => setAccountOpen(false)}
                        >
                          My Projects
                        </Link>
                        <Link
                          role="menuitem"
                          className="navbar__account-item"
                          to="/dashboard/orders"
                          onClick={() => setAccountOpen(false)}
                        >
                          My Orders
                        </Link>
                        <Link
                          role="menuitem"
                          className="navbar__account-item"
                          to="/dashboard/downloads"
                          onClick={() => setAccountOpen(false)}
                        >
                          My Downloads
                        </Link>
                        <Link
                          role="menuitem"
                          className="navbar__account-item navbar__link--with-badge"
                          to="/dashboard/wishlist"
                          onClick={() => setAccountOpen(false)}
                        >
                          Wishlist
                          {(wishlistCountQuery.data ?? 0) > 0 ? (
                            <span
                              className="project-unread-badge navbar__wishlist-badge"
                              aria-label={`${wishlistCountQuery.data} saved item${wishlistCountQuery.data === 1 ? '' : 's'}`}
                            >
                              {formatUnreadBadge(wishlistCountQuery.data ?? 0)}
                            </span>
                          ) : null}
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
                  <AuthEntryButton mode="login" returnTo={location.pathname} className="navbar__link">
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
      </nav>
    </header>
  )
}
