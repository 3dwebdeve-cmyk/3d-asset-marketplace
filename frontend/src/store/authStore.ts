import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { AuthUser } from '../types/auth'

interface AuthSession {
  access: string
  refresh: string
  user: AuthUser
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  setSession: (session: AuthSession) => void
  setUser: (user: AuthUser) => void
  updateAccessToken: (access: string) => void
  clearSession: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      setSession: ({ access, refresh, user }) =>
        set({
          accessToken: access,
          refreshToken: refresh,
          user,
          isAuthenticated: true,
        }),
      setUser: (user) => set({ user }),
      updateAccessToken: (access) => set({ accessToken: access }),
      clearSession: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        }),
    }),
    { name: 'auth-storage' },
  ),
)
