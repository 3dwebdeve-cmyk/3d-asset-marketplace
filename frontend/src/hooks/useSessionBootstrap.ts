import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getCurrentUser, refreshAccessToken } from '../api/authApi'
import { isHttpUnauthorized } from '../lib/apiError'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'

function isRotatedRefreshRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const data = (error as { response?: { data?: { code?: unknown } } }).response?.data
  return data?.code === 'token_not_valid'
}

/**
 * One retry covers a refresh cookie that was just rotated by a parallel
 * request (checkout return). A missing cookie is not retried.
 */
async function readAccessFromRefreshCookie(): Promise<string | null> {
  try {
    const { access } = await refreshAccessToken()
    return access
  } catch (error) {
    if (!isRotatedRefreshRejection(error)) {
      return null
    }
  }

  try {
    const { access } = await refreshAccessToken()
    return access
  } catch {
    return null
  }
}

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
      const access = await readAccessFromRefreshCookie()
      if (!cancelled && access) {
        restoreAccess(access)
      }
      if (!cancelled) {
        setCookieProbeDone(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [cookieProbeDone, restoreAccess])

  const hasToken = Boolean(accessToken)
  const meEnabled = cookieProbeDone && hasToken

  const { data, isSuccess, isError, error, isFetching } = useQuery({
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

    // Only an authentication rejection ends the session. A network or server error
    // keeps the session so a temporary outage does not sign the user out.
    if (isHttpUnauthorized(error)) {
      clearSession()
      toast.error('Your session has expired. Please sign in again.', {
        id: 'session-expired',
      })
    }
    setIsReady(true)
  }, [isError, error, hasToken, isFetching, clearSession])

  useEffect(() => {
    if (cookieProbeDone && !hasToken) {
      setIsReady(true)
    }
  }, [cookieProbeDone, hasToken])

  return isReady
}
