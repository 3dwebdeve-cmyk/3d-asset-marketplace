import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useNavigate } from 'react-router-dom'

import { getAdminCurrentUser, logoutUser } from '../api/authApi'
import { ADMIN_LOGIN } from '../config/adminPaths'
import { isAdministrator } from '../lib/roles'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'

export function useAdminSession() {
  const navigate = useNavigate()
  const accessToken = useAuthStore((state) => state.accessToken)
  const storedUser = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const clearSession = useAuthStore((state) => state.clearSession)

  const adminUserQuery = useQuery({
    queryKey: ['auth', 'admin', 'me', accessToken],
    queryFn: getAdminCurrentUser,
    enabled: Boolean(accessToken),
    retry: false,
    staleTime: 5 * 60 * 1000,
    initialData:
      storedUser && isAdministrator(storedUser.role) ? storedUser : undefined,
  })

  useEffect(() => {
    if (adminUserQuery.data) {
      setUser(adminUserQuery.data)
    }
  }, [adminUserQuery.data, setUser])

  useEffect(() => {
    if (!adminUserQuery.isError || !adminUserQuery.error) {
      return
    }

    const status = isAxiosError(adminUserQuery.error)
      ? adminUserQuery.error.response?.status
      : undefined

    if (status === 401 || status === 403) {
      clearSession({ redirectTo: ADMIN_LOGIN })
      navigate(ADMIN_LOGIN, { replace: true })
    }
  }, [adminUserQuery.isError, adminUserQuery.error, clearSession, navigate])

  const logoutMutation = useMutation({
    mutationFn: () => logoutUser(),
    onSettled: () => {
      clearSession({ redirectTo: ADMIN_LOGIN })
      toast.success('Signed out')
      navigate(ADMIN_LOGIN, { replace: true })
    },
  })

  const user = adminUserQuery.data ?? storedUser

  return {
    user,
    isLoading: adminUserQuery.isLoading,
    isError: adminUserQuery.isError,
    isFetching: adminUserQuery.isFetching,
    refetch: adminUserQuery.refetch,
    signOut: () => logoutMutation.mutate(),
    isSigningOut: logoutMutation.isPending,
  }
}
