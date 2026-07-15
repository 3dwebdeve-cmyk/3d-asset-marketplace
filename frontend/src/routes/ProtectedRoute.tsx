import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuthStore } from '../store/authStore'

export function ProtectedRoute() {
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const accessToken = useAuthStore((state) => state.accessToken)
  const postLogoutRedirect = useAuthStore((state) => state.postLogoutRedirect)

  if (!isAuthenticated || !accessToken) {
    if (postLogoutRedirect) {
      return <Navigate to={postLogoutRedirect} replace />
    }

    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
