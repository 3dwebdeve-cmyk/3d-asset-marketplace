import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { AuthUser } from '../types/auth'

interface AuthSession {
  access: string
  refresh: string
  user: AuthUser
}

interface ClearSessionOptions {
  /** When set, ProtectedRoute sends the user here instead of /login. */
  redirectTo?: string
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  /** One-shot redirect used after intentional sign-out. Not persisted. */
  postLogoutRedirect: string | null
  setSession: (session: AuthSession) => void
  setUser: (user: AuthUser) => void
  updateAccessToken: (access: string) => void
  updateTokens: (tokens: { access: string; refresh?: string }) => void
  clearSession: (options?: ClearSessionOptions) => void
  clearPostLogoutRedirect: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      postLogoutRedirect: null,
      setSession: ({ access, refresh, user }) =>
        set({
          accessToken: access,
          refreshToken: refresh,
          user,
          isAuthenticated: true,
          postLogoutRedirect: null,
        }),
      setUser: (user) => set({ user }),
      updateAccessToken: (access) => set({ accessToken: access }),
      updateTokens: ({ access, refresh }) =>
        set((state) => ({
          accessToken: access,
          refreshToken: refresh ?? state.refreshToken,
        })),
      clearSession: (options) =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
          postLogoutRedirect: options?.redirectTo ?? null,
        }),
      clearPostLogoutRedirect: () => set({ postLogoutRedirect: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
