import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'

import { getApiErrorMessage, isHttpNotFound, isSessionReplaced } from './apiError'
import type { ApiErrorResponse } from '../types/auth'

function axiosError(
  status: number,
  data: ApiErrorResponse | undefined,
): AxiosError<ApiErrorResponse> {
  return new AxiosError(
    'Request failed',
    String(status),
    undefined,
    undefined,
    {
      status,
      statusText: 'Error',
      data: data as ApiErrorResponse,
      headers: {},
      config: {} as never,
    },
  )
}

describe('getApiErrorMessage', () => {
  it('prefers detail from the API payload', () => {
    const error = axiosError(401, {
      detail: 'Invalid email or password.',
      code: 'authentication_failed',
    })
    expect(getApiErrorMessage(error, 'fallback')).toBe('Invalid email or password.')
  })

  it('shows throttle detail for 429 responses', () => {
    const error = axiosError(429, {
      detail: 'Too many attempts. Please try again in 12 seconds.',
      code: 'throttled',
    })
    expect(getApiErrorMessage(error, 'fallback')).toBe(
      'Too many attempts. Please try again in 12 seconds.',
    )
  })

  it('falls back for empty 429 bodies', () => {
    const error = axiosError(429, undefined)
    expect(getApiErrorMessage(error, 'fallback')).toBe(
      'Too many attempts. Please wait and try again.',
    )
  })

  it('skips code when reading field errors', () => {
    const error = axiosError(400, {
      code: 'validation_error',
      email: ['A user with this email already exists.'],
    })
    expect(getApiErrorMessage(error, 'fallback')).toBe(
      'A user with this email already exists.',
    )
  })

  it('joins multiple field errors for publish-gate responses', () => {
    const error = axiosError(400, {
      sku: ['SKU is required before publish.'],
      files: ['At least one sellable package file is required before publish.'],
    })
    expect(getApiErrorMessage(error, 'fallback')).toBe(
      'SKU is required before publish. At least one sellable package file is required before publish.',
    )
  })

  it('uses the caller context for an HTML 500 response', () => {
    const error = axiosError(500, '<html>Server Error</html>' as unknown as ApiErrorResponse)
    expect(getApiErrorMessage(error, 'Could not start checkout. Please try again.')).toBe(
      'Could not start checkout. Please try again.',
    )
  })
})

describe('isHttpNotFound', () => {
  it('returns true for axios 404 responses', () => {
    expect(isHttpNotFound(axiosError(404, { detail: 'Not found.' }))).toBe(true)
  })

  it('returns false for other statuses and non-axios errors', () => {
    expect(isHttpNotFound(axiosError(500, { detail: 'Server error.' }))).toBe(false)
    expect(isHttpNotFound(new Error('network down'))).toBe(false)
    expect(isHttpNotFound(undefined)).toBe(false)
  })
})

describe('isSessionReplaced', () => {
  it('recognises a session ended by another device signing in', () => {
    const error = axiosError(401, {
      detail: 'You were signed out because your account was signed in on another device.',
      code: 'session_replaced',
    })
    expect(isSessionReplaced(error)).toBe(true)
  })

  it('ignores other authentication failures', () => {
    expect(isSessionReplaced(axiosError(401, { detail: 'x', code: 'token_not_valid' }))).toBe(false)
    expect(isSessionReplaced(new Error('network'))).toBe(false)
  })
})
