import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getCurrentUser } from '../api/authApi'
import { useAuthStore } from '../store/authStore'

export function useSessionBootstrap(): boolean {
  const accessToken = useAuthStore((state) => state.accessToken)
  const setUser = useAuthStore((state) => state.setUser)
  const clearSession = useAuthStore((state) => state.clearSession)

  const hasToken = Boolean(accessToken)

  const { data, isSuccess, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getCurrentUser,
    enabled: hasToken,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (isSuccess && data) {
      setUser(data)
    }
  }, [isSuccess, data, setUser])

  useEffect(() => {
    if (isError) {
      clearSession()
    }
  }, [isError, clearSession])

  if (!hasToken) {
    return true
  }

  return isSuccess || isError
}
