import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { useLayoutEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { safeReturnLocation } from '../../lib/safePostLoginPath'
import { isAdministrator } from '../../lib/roles'
import { useAuthStore } from '../../store/authStore'
import { useAuthUiStore } from '../../store/authUiStore'

export function LoginPage() {
  useDocumentSeo({
    title: 'Sign in | AssetHive 3D',
    description: 'Sign in to your AssetHive 3D account to manage orders, downloads and your wishlist.',
    robots: 'noindex, nofollow',
  })

  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const openAuthModal = useAuthUiStore((state) => state.open)
  const redirectFrom = safeReturnLocation(
    (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)
      ?.from,
  )

  useLayoutEffect(() => {
    if (isAuthenticated) {
      return
    }
    openAuthModal({ mode: 'login', returnTo: redirectFrom })
  }, [isAuthenticated, openAuthModal, redirectFrom])

  if (isAuthenticated && isAdministrator(user?.role)) {
    return <Navigate to="/console" replace />
  }

  if (isAuthenticated) {
    return <Navigate to={redirectFrom ?? '/dashboard'} replace />
  }

  return <Navigate to="/" replace />
}
