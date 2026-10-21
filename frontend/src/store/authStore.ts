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
  /**
   * This browser may hold a refresh cookie (someone signed in here). It only decides whether
   * the app probes for a session on first paint: visitors who never signed in skip a request
   * that could only fail with a 401. It is a hint, never proof, and never grants access.
   */
  sessionHint: boolean
  /** One-shot redirect used after intentional sign-out. Not persisted. */
  postLogoutRedirect: string | null
  setSession: (session: AuthSession, options?: { remember?: boolean }) => void
  restoreAccess: (access: string) => void
  setUser: (user: AuthUser) => void
  updateAccessToken: (access: string) => void
  clearSession: (options?: ClearSessionOptions) => void
  clearPostLogoutRedirect: () => void
  setSessionHint: (hint: boolean) => void
}

interface PersistedAuthState {
  rememberSession: boolean
  sessionHint: boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      rememberSession: true,
      sessionHint: false,
      postLogoutRedirect: null,
      setSession: ({ access, user }, options) =>
        set({
          accessToken: access,
          user,
          isAuthenticated: true,
          rememberSession: options?.remember !== false,
          sessionHint: true,
          postLogoutRedirect: null,
        }),
      restoreAccess: (access) =>
        set({
          accessToken: access,
          isAuthenticated: true,
          sessionHint: true,
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
          sessionHint: false,
          postLogoutRedirect: options?.redirectTo ?? null,
        }),
      clearPostLogoutRedirect: () => set({ postLogoutRedirect: null }),
      setSessionHint: (hint) => set({ sessionHint: hint }),
    }),
    {
      name: 'auth-storage',
      version: 1,
      // Browsers that stored this before the hint existed may be signed in: probe once. The
      // probe clears the hint if it finds no session, so this runs at most once per browser.
      migrate: (persisted, version): PersistedAuthState => {
        const stored = (persisted ?? {}) as Partial<PersistedAuthState>
        return {
          rememberSession: stored.rememberSession !== false,
          sessionHint: version < 1 ? true : stored.sessionHint === true,
        }
      },
      partialize: (state): PersistedAuthState => ({
        rememberSession: state.rememberSession,
        sessionHint: state.sessionHint,
      }),
    },
  ),
)
