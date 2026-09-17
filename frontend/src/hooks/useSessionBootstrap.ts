import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getCurrentUser, refreshAccessToken } from '../api/authApi'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'

/**
 * Restores a session from the httpOnly refresh cookie on first paint.
 * Once ready, gaining a token via login must NOT remount the router
 * (that would cancel the post-login navigate to /dashboard).
 */
export function useSessionBootstrap(): boolean {
  const accessToken = useAuthStore((state) => state.accessToken)
  const restoreAccess = useAuthStore((state) => state.restoreAccess)
  const setUser = useAuthStore((state) => state.setUser)
  const clearSession = useAuthStore((state) => state.clearSession)

  const [cookieProbeDone, setCookieProbeDone] = useState(
    () => Boolean(useAuthStore.getState().accessToken),
  )
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (cookieProbeDone) {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const { access } = await refreshAccessToken()
        if (!cancelled) {
          restoreAccess(access)
        }
      } catch {
        // No usable refresh cookie — continue as guest.
      } finally {
        if (!cancelled) {
          setCookieProbeDone(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [cookieProbeDone, restoreAccess])

  const hasToken = Boolean(accessToken)
  const meEnabled = cookieProbeDone && hasToken

  const { data, isSuccess, isError, isFetching } = useQuery({
    queryKey: ['auth', 'me', accessToken],
    queryFn: getCurrentUser,
    enabled: meEnabled,
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
    if (cookieProbeDone && !hasToken) {
      setIsReady(true)
    }
  }, [cookieProbeDone, hasToken])

  return isReady
}
