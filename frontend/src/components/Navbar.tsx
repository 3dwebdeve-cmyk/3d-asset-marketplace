import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'

import { logoutUser } from '../api/authApi'
import { isAdministrator } from '../lib/roles'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import { Button } from './ui/Button'

export function Navbar() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const clearSession = useAuthStore((state) => state.clearSession)

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
                <Link className="navbar__link" to="/dashboard">
                  Dashboard
                </Link>
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
