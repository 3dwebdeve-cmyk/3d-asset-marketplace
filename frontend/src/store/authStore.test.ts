import { beforeEach, describe, expect, it } from 'vitest'

import { resetAuthStore, testUser } from '../test/test-utils'
import { useAuthStore } from './authStore'

beforeEach(() => {
  resetAuthStore()
})

describe('auth store session hint', () => {
  it('starts false for a browser that never signed in', () => {
    expect(useAuthStore.getState().sessionHint).toBe(false)
  })

  it('is set by signing in and by restoring a session, and cleared by signing out', () => {
    useAuthStore.getState().setSession({ access: 'a', user: testUser })
    expect(useAuthStore.getState().sessionHint).toBe(true)

    useAuthStore.getState().clearSession()
    expect(useAuthStore.getState().sessionHint).toBe(false)

    useAuthStore.getState().restoreAccess('b')
    expect(useAuthStore.getState().sessionHint).toBe(true)
  })

  it('is saved in the browser, but the access token never is', () => {
    useAuthStore.getState().setSession({ access: 'secret-access-token', user: testUser })

    const saved = localStorage.getItem('auth-storage') ?? ''
    expect(JSON.parse(saved).state.sessionHint).toBe(true)
    expect(saved).not.toContain('secret-access-token')
  })

  it('treats a browser that saved the older format as possibly signed in, and keeps its choices', async () => {
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({ state: { rememberSession: false }, version: 0 }),
    )

    await useAuthStore.persist.rehydrate()

    expect(useAuthStore.getState().sessionHint).toBe(true)
    expect(useAuthStore.getState().rememberSession).toBe(false)
  })

  it('keeps a saved "no session" hint as it is', async () => {
    localStorage.setItem(
      'auth-storage',
      JSON.stringify({ state: { rememberSession: true, sessionHint: false }, version: 1 }),
    )

    await useAuthStore.persist.rehydrate()

    expect(useAuthStore.getState().sessionHint).toBe(false)
  })
})
