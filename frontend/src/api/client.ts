import axios, {
  AxiosHeaders,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios'

import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import type { RefreshResponse } from '../types/auth'

const SESSION_EXPIRED_TOAST_ID = 'session-expired'

/** Empty = same-origin `/api/v1` (Vite proxy locally, Nginx in Docker). */
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

/** Canonical REST API version prefix. */
export const API_PREFIX = '/api/v1'

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

let refreshRequest: Promise<string> | null = null

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

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined
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
      refreshRequest ??= requestFreshAccessToken().then((access) => {
        updateAccessToken(access)
        return access
      })
      const newAccess = await refreshRequest

      const headers = AxiosHeaders.from(originalRequest.headers)
      headers.set('Authorization', `Bearer ${newAccess}`)
      originalRequest.headers = headers

      return apiClient(originalRequest)
    } catch (refreshError) {
      clearSession()
      toast.error('Your session has expired. Please sign in again.', {
        id: SESSION_EXPIRED_TOAST_ID,
      })
      return Promise.reject(refreshError)
    } finally {
      refreshRequest = null
    }
  },
)
