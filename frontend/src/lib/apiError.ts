import { isAxiosError } from 'axios'

import type { ApiErrorResponse } from '../types/auth'

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError<ApiErrorResponse>(error)) {
    return fallback
  }

  const status = error.response?.status
  const data = error.response?.data

  if (!data) {
    if (status === 429) {
      return 'Too many attempts. Please wait and try again.'
    }
    return fallback
  }

  if (typeof data.detail === 'string' && data.detail.trim()) {
    return data.detail
  }

  const messages = Object.entries(data).flatMap(([key, value]) => {
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

  if (messages[0]) {
    return messages[0]
  }

  if (status === 429) {
    return 'Too many attempts. Please wait and try again.'
  }

  return fallback
}
