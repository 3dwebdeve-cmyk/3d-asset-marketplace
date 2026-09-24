import { create } from 'zustand'

import { safePostLoginPath } from '../lib/safePostLoginPath'

export type AuthUiMode = 'login' | 'register'

interface OpenAuthModalOptions {
  mode: AuthUiMode
  returnTo?: string | null
}

interface AuthUiState {
  isOpen: boolean
  mode: AuthUiMode
  returnTo: string | null
  open: (options: OpenAuthModalOptions) => void
  close: () => void
  setMode: (mode: AuthUiMode) => void
}

export const useAuthUiStore = create<AuthUiState>((set) => ({
  isOpen: false,
  mode: 'login',
  returnTo: null,
  open: ({ mode, returnTo }) =>
    set({
      isOpen: true,
      mode,
      returnTo: safePostLoginPath(returnTo ?? null),
    }),
  close: () =>
    set({
      isOpen: false,
      returnTo: null,
    }),
  setMode: (mode) => set({ mode }),
}))
