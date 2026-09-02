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
  /** When false, tokens stay in memory only and are not written to localStorage. */
  rememberSession: boolean
  /** One-shot redirect used after intentional sign-out. Not persisted. */
  postLogoutRedirect: string | null
  setSession: (session: AuthSession, options?: { remember?: boolean }) => void
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
      rememberSession: true,
      postLogoutRedirect: null,
      setSession: ({ access, refresh, user }, options) =>
        set({
          accessToken: access,
          refreshToken: refresh,
          user,
          isAuthenticated: true,
          rememberSession: options?.remember !== false,
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
          rememberSession: true,
          postLogoutRedirect: options?.redirectTo ?? null,
        }),
      clearPostLogoutRedirect: () => set({ postLogoutRedirect: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => {
        if (state.rememberSession === false) {
          return { rememberSession: false as const }
        }
        return {
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
          user: state.user,
          isAuthenticated: state.isAuthenticated,
          rememberSession: true as const,
        }
      },
    },
  ),
)
