import { afterEach, describe, expect, it, vi } from 'vitest'

import { logger } from './logger'

const reportClientError = vi.hoisted(() => vi.fn())

vi.mock('./sentry', () => ({
  reportClientError,
}))

describe('logger', () => {
  afterEach(() => {
    reportClientError.mockReset()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('forwards errors to Sentry via reportClientError', () => {
    vi.stubEnv('DEV', false)
    logger.error('checkout failed', { orderId: '1' })
    expect(reportClientError).toHaveBeenCalledWith(
      'checkout failed',
      { orderId: '1' },
      'error',
    )
  })

  it('forwards warnings at warning level', () => {
    vi.stubEnv('DEV', false)
    logger.warn('slow download', { fileId: '2' })
    expect(reportClientError).toHaveBeenCalledWith(
      'slow download',
      { fileId: '2' },
      'warning',
    )
  })
})
