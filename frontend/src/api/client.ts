import axios, {
  AxiosHeaders,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios'

import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import type { RefreshResponse } from '../types/auth'

const SESSION_EXPIRED_TOAST_ID = 'session-expired'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

let refreshRequest: Promise<string> | null = null

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState()
  if (accessToken) {
    const headers = AxiosHeaders.from(config.headers)
    headers.set('Authorization', `Bearer ${accessToken}`)
    config.headers = headers
  }
  return config
})

async function requestFreshAccessToken(refreshToken: string): Promise<string> {
  const response = await axios.post<RefreshResponse>(
    `${apiBaseUrl}/api/auth/token/refresh/`,
    { refresh: refreshToken },
    {
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
    const { refreshToken, updateAccessToken, clearSession } = useAuthStore.getState()

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      !refreshToken ||
      originalRequest.url?.includes('/api/auth/token/refresh/')
    ) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    try {
      refreshRequest ??= requestFreshAccessToken(refreshToken)
      const accessToken = await refreshRequest
      updateAccessToken(accessToken)

      const headers = AxiosHeaders.from(originalRequest.headers)
      headers.set('Authorization', `Bearer ${accessToken}`)
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
