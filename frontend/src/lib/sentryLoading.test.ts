import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({})),
  captureReactException: vi.fn(),
  reactErrorHandler: vi.fn(() => vi.fn()),
  withScope: vi.fn(),
}))
vi.mock('@sentry/react', () => sentry)

async function freshSentryModule() {
  // The module keeps the loaded Sentry in a variable, so each test starts from a clean copy.
  vi.resetModules()
  return import('./sentry')
}

describe('loading Sentry only when it is configured', () => {
  beforeEach(() => {
    for (const fn of Object.values(sentry)) fn.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('never loads Sentry without a DSN, and leaves React its own error handling', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    const module = await freshSentryModule()

    module.initFrontendSentry()
    module.captureReactException(new Error('boom'), { componentStack: '' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(sentry.init).not.toHaveBeenCalled()
    expect(sentry.captureReactException).not.toHaveBeenCalled()
    expect(module.reactRootErrorHandlers()).toEqual({})
  })

  it('loads Sentry and forwards errors when a DSN is set', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@example.ingest.sentry.io/1')
    const module = await freshSentryModule()

    module.initFrontendSentry()
    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalledTimes(1))
    expect(sentry.init.mock.calls[0][0]).toMatchObject({ sendDefaultPii: false })

    module.captureReactException(new Error('boom'), { componentStack: '' })
    await vi.waitFor(() => expect(sentry.captureReactException).toHaveBeenCalledTimes(1))

    const handlers = module.reactRootErrorHandlers()
    expect(Object.keys(handlers).sort()).toEqual(['onCaughtError', 'onRecoverableError', 'onUncaughtError'])
  })
})
