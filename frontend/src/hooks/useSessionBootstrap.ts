import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getCurrentUser } from '../api/authApi'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'

/**
 * Validates a *persisted* session on first paint only.
 * Once the app is ready, gaining a token via login must NOT remount the router
 * (that would cancel the post-login navigate to /dashboard).
 */
export function useSessionBootstrap(): boolean {
  const accessToken = useAuthStore((state) => state.accessToken)
  const setUser = useAuthStore((state) => state.setUser)
  const clearSession = useAuthStore((state) => state.clearSession)

  const [isReady, setIsReady] = useState(() => !useAuthStore.getState().accessToken)

  const hasToken = Boolean(accessToken)

  const { data, isSuccess, isError, isFetching } = useQuery({
    // Include the token so a fresh login does not reuse a previous failed query.
    queryKey: ['auth', 'me', accessToken],
    queryFn: getCurrentUser,
    enabled: hasToken,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (isSuccess && data) {
      setUser(data)
      setIsReady(true)
    }
  }, [isSuccess, data, setUser])

  useEffect(() => {
    // Ignore stale error flags while a new request is in flight (e.g. right after login).
    if (!isError || !hasToken || isFetching) {
      return
    }

    clearSession()
    toast.error('Your session has expired. Please sign in again.', {
      id: 'session-expired',
    })
    setIsReady(true)
  }, [isError, hasToken, isFetching, clearSession])

  useEffect(() => {
    if (!hasToken) {
      setIsReady(true)
    }
  }, [hasToken])

  return isReady
}
