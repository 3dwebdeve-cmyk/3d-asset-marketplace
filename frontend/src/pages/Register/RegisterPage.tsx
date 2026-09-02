import { useLayoutEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { safePostLoginPath } from '../../lib/safePostLoginPath'
import { isAdministrator } from '../../lib/roles'
import { useAuthStore } from '../../store/authStore'
import { useAuthUiStore } from '../../store/authUiStore'

export function RegisterPage() {
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const openAuthModal = useAuthUiStore((state) => state.open)
  const redirectFrom = safePostLoginPath(
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname,
  )

  useLayoutEffect(() => {
    if (isAuthenticated) {
      return
    }
    openAuthModal({ mode: 'register', returnTo: redirectFrom })
  }, [isAuthenticated, openAuthModal, redirectFrom])

  if (isAuthenticated && isAdministrator(user?.role)) {
    return <Navigate to="/admin" replace />
  }

  if (isAuthenticated) {
    return <Navigate to={redirectFrom ?? '/dashboard'} replace />
  }

  return <Navigate to="/" replace />
}
