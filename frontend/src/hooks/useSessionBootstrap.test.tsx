import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getCurrentUser } from '../api/authApi'
import { useAuthStore } from '../store/authStore'
import { createTestQueryClient, resetAuthStore, testUser } from '../test/test-utils'
import { useSessionBootstrap } from './useSessionBootstrap'

vi.mock('../api/authApi', () => ({
  getCurrentUser: vi.fn(),
}))

const mockedGetCurrentUser = vi.mocked(getCurrentUser)

function createWrapper() {
  const queryClient = createTestQueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  resetAuthStore()
})

describe('useSessionBootstrap', () => {
  it('is ready immediately and skips the API when no token is stored', () => {
    const { result } = renderHook(() => useSessionBootstrap(), {
      wrapper: createWrapper(),
    })

    expect(result.current).toBe(true)
    expect(mockedGetCurrentUser).not.toHaveBeenCalled()
  })

  it('hydrates the store with the fresh user when the token is valid', async () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: null,
      isAuthenticated: true,
    })
    mockedGetCurrentUser.mockResolvedValue(testUser)

    const { result } = renderHook(() => useSessionBootstrap(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(true))

    expect(mockedGetCurrentUser).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().user).toEqual(testUser)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('clears the session when token validation fails', async () => {
    useAuthStore.setState({
      accessToken: 'stale-token',
      refreshToken: 'stale-refresh',
      user: testUser,
      isAuthenticated: true,
    })
    mockedGetCurrentUser.mockRejectedValue(new Error('Unauthorized'))

    const { result } = renderHook(() => useSessionBootstrap(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false))

    expect(result.current).toBe(true)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})
