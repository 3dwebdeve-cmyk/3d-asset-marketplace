import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { getCurrentUser, refreshAccessToken } from '../api/authApi'
import {
  SESSION_REPLACED_MESSAGE,
  isHttpUnauthorized,
  isSessionReplaced,
} from '../lib/apiError'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'

function isRotatedRefreshRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const data = (error as { response?: { data?: { code?: unknown } } }).response?.data
  return data?.code === 'token_not_valid'
}

/** No response or a 5xx: the server could not answer, which says nothing about the session. */
function isTransientFailure(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false
  }
  const status = error.response?.status
  return status === undefined || status >= 500
}

type RefreshOutcome =
  | { kind: 'restored'; access: string }
  | { kind: 'rejected' }
  | { kind: 'unavailable' }

function failedRefresh(error: unknown): RefreshOutcome {
  return isTransientFailure(error) ? { kind: 'unavailable' } : { kind: 'rejected' }
}

/**
 * One retry covers a refresh cookie that was just rotated by a parallel
 * request (checkout return). A missing cookie is not retried.
 */
async function readAccessFromRefreshCookie(): Promise<RefreshOutcome> {
  try {
    const { access } = await refreshAccessToken()
    return { kind: 'restored', access }
  } catch (error) {
    if (isSessionReplaced(error)) {
      toast.error(SESSION_REPLACED_MESSAGE, { id: 'session-expired' })
    }
    if (!isRotatedRefreshRejection(error)) {
      return failedRefresh(error)
    }
  }

  try {
    const { access } = await refreshAccessToken()
    return { kind: 'restored', access }
  } catch (error) {
    return failedRefresh(error)
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
  const setSessionHint = useAuthStore((state) => state.setSessionHint)

  // Nobody has signed in on this browser: there is no refresh cookie to find, so skip the
  // probe (it would only be a failing request that shows as an error in the console).
  const [cookieProbeDone, setCookieProbeDone] = useState(() => {
    const { accessToken: current, sessionHint } = useAuthStore.getState()
    return Boolean(current) || !sessionHint
  })
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (cookieProbeDone) {
      return
    }

    let cancelled = false

    void (async () => {
      const outcome = await readAccessFromRefreshCookie()
      if (cancelled) {
        return
      }
      if (outcome.kind === 'restored') {
        restoreAccess(outcome.access)
      } else if (outcome.kind === 'rejected') {
        setSessionHint(false)
      }
      // 'unavailable' keeps the hint so the next visit tries the cookie again.
      setCookieProbeDone(true)
    })()

    return () => {
      cancelled = true
    }
  }, [cookieProbeDone, restoreAccess, setSessionHint])

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
