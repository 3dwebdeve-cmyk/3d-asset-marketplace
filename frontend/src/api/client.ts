import axios, {
  AxiosHeaders,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios'

import {
  SESSION_REPLACED_MESSAGE,
  getApiErrorCode,
  isHttpUnauthorized,
  isSessionReplaced,
} from '../lib/apiError'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import { requestStepUp } from '../store/stepUpStore'
import type { RefreshResponse } from '../types/auth'

const SESSION_EXPIRED_TOAST_ID = 'session-expired'

/** Empty = same-origin `/api/v1` (Vite proxy locally, Nginx in Docker). */
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

/** Canonical REST API version prefix. */
const API_PREFIX = '/api/v1'

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
  /** Already repeated once after the administrator entered an authenticator code. */
  _stepUpRetry?: boolean
}

/** The server wants a fresh authenticator code before this dangerous console action. */
function isStepUpRequired(error: AxiosError): boolean {
  return error.response?.status === 403 && getApiErrorCode(error) === 'step_up_required'
}

async function requestFreshAccessToken(): Promise<string> {
  const response = await axios.post<RefreshResponse>(
    `${apiBaseUrl}${API_PREFIX}/auth/token/refresh/`,
    {},
    {
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )
  return response.data.access
}

/**
 * One in-flight cookie rotation for the whole page.
 * Stripe sends the buyer back with a full reload. React StrictMode (and a
 * second tab) can otherwise present the same refresh cookie twice; the loser
 * is already blacklisted and its 401 used to delete the replacement cookie.
 */
let sessionRefresh: { epoch: number; promise: Promise<string> } | null = null

/** Shares one rotation per sign-out generation; a token from before a sign-out is never used. */
export function refreshSessionAccessToken(): Promise<string> {
  const { sessionEpoch } = useAuthStore.getState()
  if (sessionRefresh?.epoch !== sessionEpoch) {
    const promise = requestFreshAccessToken().finally(() => {
      if (sessionRefresh?.promise === promise) sessionRefresh = null
    })
    sessionRefresh = { epoch: sessionEpoch, promise }
  }
  return sessionRefresh.promise.then((access) => {
    if (useAuthStore.getState().sessionEpoch !== sessionEpoch) {
      throw new Error('Signed out while refreshing the session.')
    }
    return access
  })
}

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const headers = AxiosHeaders.from(config.headers)
  const { accessToken } = useAuthStore.getState()

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  // Let the browser set multipart boundary for FormData uploads.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    headers.delete('Content-Type')
  }

  config.headers = headers
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined

    if (originalRequest && !originalRequest._stepUpRetry && isStepUpRequired(error)) {
      originalRequest._stepUpRetry = true
      try {
        await requestStepUp()
      } catch {
        // Cancelled: the caller gets the server's own message ("Enter a code ...").
        return Promise.reject(error)
      }
      return apiClient(originalRequest)
    }

    const { updateAccessToken, clearSession, isAuthenticated, accessToken } =
      useAuthStore.getState()

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      originalRequest.url?.includes(`${API_PREFIX}/auth/token/refresh/`)
    ) {
      return Promise.reject(error)
    }

    // Only attempt cookie refresh when we believe a session may exist.
    if (!isAuthenticated && !accessToken) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    try {
      const newAccess = await refreshSessionAccessToken()
      updateAccessToken(newAccess)

      const headers = AxiosHeaders.from(originalRequest.headers)
      headers.set('Authorization', `Bearer ${newAccess}`)
      originalRequest.headers = headers

      return apiClient(originalRequest)
    } catch (refreshError) {
      // Only a real auth rejection ends the session. A network or 5xx failure
      // during refresh leaves the session in place so the user is not signed out.
      if (isHttpUnauthorized(refreshError)) {
        clearSession()
        toast.error(
          isSessionReplaced(refreshError)
            ? SESSION_REPLACED_MESSAGE
            : 'Your session has expired. Please sign in again.',
          { id: SESSION_EXPIRED_TOAST_ID },
        )
      }
      return Promise.reject(refreshError)
    }
  },
)
