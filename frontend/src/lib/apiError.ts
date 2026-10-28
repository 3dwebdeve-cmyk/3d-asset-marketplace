import { isAxiosError } from 'axios'

import type { ApiErrorResponse } from '../types/auth'

export function isHttpNotFound(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404
}

/** True only for an authentication rejection. Network and server errors are not auth failures. */
export function isHttpUnauthorized(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false
  }
  const status = error.response?.status
  return status === 401 || status === 403
}

export const SESSION_REPLACED_MESSAGE =
  'You were signed out because your account was signed in on another device.'

/** True when the server ended this device's session because a newer device signed in. */
export function isSessionReplaced(error: unknown): boolean {
  return (
    isAxiosError(error) &&
    error.response?.status === 401 &&
    (error.response.data as { code?: unknown } | undefined)?.code === 'session_replaced'
  )
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

/** Machine-readable `code` from an API error body, e.g. `mfa_expired`. */
export function getApiErrorCode(error: unknown): string | undefined {
  if (!isAxiosError(error)) {
    return undefined
  }
  const data = error.response?.data as unknown
  if (data && typeof data === 'object' && 'code' in data) {
    const code = (data as { code: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}
