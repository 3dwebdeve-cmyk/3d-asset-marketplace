import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { isAdministrator } from '../lib/roles'
import { useAuthStore } from '../store/authStore'

export function AdminRoute() {
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const accessToken = useAuthStore((state) => state.accessToken)
  const user = useAuthStore((state) => state.user)
  const postLogoutRedirect = useAuthStore((state) => state.postLogoutRedirect)

  if (!isAuthenticated || !accessToken) {
    if (postLogoutRedirect) {
      return <Navigate to={postLogoutRedirect} replace />
    }

    return <Navigate to="/admin/login" replace state={{ from: location }} />
  }

  if (!isAdministrator(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
