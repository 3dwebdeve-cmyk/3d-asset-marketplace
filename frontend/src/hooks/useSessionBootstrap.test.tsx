import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getCurrentUser, refreshAccessToken } from '../api/authApi'
import { toast } from '../lib/toast'
import { useAuthStore } from '../store/authStore'
import {
  createTestQueryClient,
  resetAuthStore,
  resetToastStore,
  testUser,
} from '../test/test-utils'
import { useSessionBootstrap } from './useSessionBootstrap'

vi.mock('../api/authApi', () => ({
  getCurrentUser: vi.fn(),
  refreshAccessToken: vi.fn(),
}))

vi.mock('../lib/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
    clear: vi.fn(),
  },
}))

const mockedGetCurrentUser = vi.mocked(getCurrentUser)
const mockedRefreshAccessToken = vi.mocked(refreshAccessToken)
const mockedToastError = vi.mocked(toast.error)

function createWrapper() {
  const queryClient = createTestQueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  mockedRefreshAccessToken.mockRejectedValue(new Error('no cookie'))
})

describe('useSessionBootstrap', () => {
  it('is ready as guest when silent refresh finds no cookie', async () => {
    const { result } = renderHook(() => useSessionBootstrap(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(true))
    expect(mockedRefreshAccessToken).toHaveBeenCalled()
    expect(mockedGetCurrentUser).not.toHaveBeenCalled()
  })

  it('restores access from the refresh cookie then loads /me/', async () => {
    mockedRefreshAccessToken.mockResolvedValue({ access: 'cookie-access' })
    mockedGetCurrentUser.mockResolvedValue(testUser)

    const { result } = renderHook(() => useSessionBootstrap(), {
      wrapper: createWrapper(),
    })

    expect(result.current).toBe(false)

    await waitFor(() => expect(result.current).toBe(true))

    expect(mockedRefreshAccessToken).toHaveBeenCalled()
    expect(mockedGetCurrentUser).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().accessToken).toBe('cookie-access')
    expect(useAuthStore.getState().user).toEqual(testUser)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('stays ready when a token appears after a logged-out bootstrap (login flow)', async () => {
    mockedGetCurrentUser.mockResolvedValue(testUser)

    const { result } = renderHook(() => useSessionBootstrap(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current).toBe(true))

    act(() => {
      useAuthStore.getState().setSession({
        access: 'fresh-access',
        user: testUser,
      })
    })

    // Must not remount the app / flip back to not-ready, or login navigation breaks.
    expect(result.current).toBe(true)

    await waitFor(() => expect(mockedGetCurrentUser).toHaveBeenCalled())
    expect(result.current).toBe(true)
  })

  it('hydrates the store with the fresh user when an in-memory token is already present', async () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      user: null,
      isAuthenticated: true,
    })
    mockedGetCurrentUser.mockResolvedValue(testUser)

    const { result } = renderHook(() => useSessionBootstrap(), {
      wrapper: createWrapper(),
    })

    expect(result.current).toBe(false)

    await waitFor(() => expect(result.current).toBe(true))

    expect(mockedRefreshAccessToken).not.toHaveBeenCalled()
    expect(mockedGetCurrentUser).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().user).toEqual(testUser)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('clears the session and shows a session-expired toast when token validation fails', async () => {
    useAuthStore.setState({
      accessToken: 'stale-token',
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
    expect(mockedToastError).toHaveBeenCalledWith(
      'Your session has expired. Please sign in again.',
      { id: 'session-expired' },
    )
  })
})
