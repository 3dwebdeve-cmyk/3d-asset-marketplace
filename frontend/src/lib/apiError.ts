import { isAxiosError } from 'axios'

import type { ApiErrorResponse } from '../types/auth'

export function isHttpNotFound(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError<ApiErrorResponse>(error)) {
    return fallback
  }

  const status = error.response?.status
  const data = error.response?.data as unknown

  if (!data) {
    if (status === 429) {
      return 'Too many attempts. Please wait and try again.'
    }
    return fallback
  }

  // Django DEBUG HTML (or other non-JSON bodies) must not be treated as field maps.
  if (typeof data === 'string') {
    if (status === 404) {
      return 'Service endpoint not found. Please restart the backend and try again.'
    }
    if (status === 500) {
      return fallback
    }
    return fallback
  }

  if (typeof data !== 'object' || data === null) {
    return fallback
  }

  const payload = data as ApiErrorResponse

  if (typeof payload.detail === 'string' && payload.detail.trim()) {
    return payload.detail
  }

  const messages = Object.entries(payload).flatMap(([key, value]) => {
    if (key === 'code') {
      return []
    }
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string')
    }
    if (typeof value === 'string') {
      return [value]
    }
    return []
  })

  if (messages.length > 0) {
    return messages.join(' ')
  }

  if (status === 429) {
    return 'Too many attempts. Please wait and try again.'
  }

  return fallback
}
