import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { AuthUser } from '../types/auth'

interface AuthSession {
  access: string
  user: AuthUser
}

interface ClearSessionOptions {
  /** When set, ProtectedRoute sends the user here instead of /login. */
  redirectTo?: string
}

interface AuthState {
  accessToken: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  /**
   * Login preference only (checkbox default). Never persists tokens —
   * refresh lives in an httpOnly cookie; access stays in memory.
   */
  rememberSession: boolean
  /** One-shot redirect used after intentional sign-out. Not persisted. */
  postLogoutRedirect: string | null
  setSession: (session: AuthSession, options?: { remember?: boolean }) => void
  restoreAccess: (access: string) => void
  setUser: (user: AuthUser) => void
  updateAccessToken: (access: string) => void
  clearSession: (options?: ClearSessionOptions) => void
  clearPostLogoutRedirect: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      rememberSession: true,
      postLogoutRedirect: null,
      setSession: ({ access, user }, options) =>
        set({
          accessToken: access,
          user,
          isAuthenticated: true,
          rememberSession: options?.remember !== false,
          postLogoutRedirect: null,
        }),
      restoreAccess: (access) =>
        set({
          accessToken: access,
          isAuthenticated: true,
          postLogoutRedirect: null,
        }),
      setUser: (user) => set({ user }),
      updateAccessToken: (access) => set({ accessToken: access }),
      clearSession: (options) =>
        set({
          accessToken: null,
          user: null,
          isAuthenticated: false,
          rememberSession: true,
          postLogoutRedirect: options?.redirectTo ?? null,
        }),
      clearPostLogoutRedirect: () => set({ postLogoutRedirect: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        rememberSession: state.rememberSession,
      }),
    },
  ),
)
