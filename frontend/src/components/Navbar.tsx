import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'

import { logoutUser } from '../api/authApi'
import { getCart } from '../api/cartApi'
import { listWishlistItems } from '../api/wishlistApi'
import { isAdministrator } from '../lib/roles'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import { useCartUiStore } from '../store/cartUiStore'
import { Button } from './ui/Button'

function formatUnreadBadge(count: number): string {
  if (count > 99) return '99+'
  return String(count)
}

export function Navbar() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const clearSession = useAuthStore((state) => state.clearSession)
  const openCartDrawer = useCartUiStore((state) => state.openDrawer)

  const wishlistCountQuery = useQuery({
    queryKey: ['wishlist', 'count'],
    queryFn: () => listWishlistItems({ page: 1, page_size: 1 }),
    enabled: isAuthenticated && !isAdministrator(user?.role),
    select: (data) => data.count,
  })

  const cartCountQuery = useQuery({
    queryKey: ['cart', 'count'],
    queryFn: getCart,
    enabled: isAuthenticated && !isAdministrator(user?.role),
    select: (data) => data.total_quantity,
  })

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (refreshToken) {
        await logoutUser(refreshToken)
      }
    },
    onSettled: () => {
      // Prefer home over /login; ProtectedRoute honors redirectTo when
      // signing out from a protected page.
      clearSession({ redirectTo: '/' })
      toast.success('Signed out')
      navigate('/', { replace: true })
    },
  })

  return (
    <header className="navbar">
      <nav className="navbar__inner" aria-label="Main">
        <Link className="navbar__brand" to="/">
          3D Asset Marketplace
        </Link>

        <div className="navbar__actions">
          <Link className="navbar__link" to="/products">
            Browse Models
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
          {isAuthenticated ? (
            <>
              {user?.full_name ? (
                <span className="navbar__user" aria-label="Signed in as">
                  {user.full_name}
                </span>
              ) : null}
              {isAdministrator(user?.role) ? (
                <Link className="navbar__link" to="/admin">
                  Admin
                </Link>
              ) : (
                <>
                  <Link className="navbar__link" to="/dashboard">
                    Dashboard
                  </Link>
                  <Link className="navbar__link" to="/dashboard/projects">
                    My Projects
                  </Link>
                  <Link className="navbar__link" to="/dashboard/orders">
                    My Orders
                  </Link>
                  <Link className="navbar__link" to="/dashboard/downloads">
                    My Downloads
                  </Link>
                  <button
                    type="button"
                    className="navbar__link navbar__link--with-badge navbar__cart-button"
                    onClick={openCartDrawer}
                  >
                    Cart
                    {(cartCountQuery.data ?? 0) > 0 ? (
                      <span
                        className="project-unread-badge navbar__cart-badge"
                        aria-label={`${cartCountQuery.data} item${cartCountQuery.data === 1 ? '' : 's'} in cart`}
                      >
                        {formatUnreadBadge(cartCountQuery.data ?? 0)}
                      </span>
                    ) : null}
                  </button>
                  <Link className="navbar__link navbar__link--with-badge" to="/dashboard/wishlist">
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
                </>
              )}
              <Link className="navbar__link" to="/profile">
                Profile
              </Link>
              <Button
                className="navbar__sign-out"
                variant="secondary"
                isLoading={logoutMutation.isPending}
                onClick={() => logoutMutation.mutate()}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link className="navbar__link" to="/login">
                Sign in
              </Link>
              <Link className="navbar__link navbar__link--primary" to="/register">
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
