import { create } from 'zustand'

/**
 * The "enter your authenticator code" prompt before a dangerous console action.
 *
 * The API client calls `requestStepUp()` when the server answers 403 `step_up_required`. The
 * prompt (AdminStepUpDialog, mounted by the console layout) opens, and the returned promise
 * settles when the administrator confirms a code or cancels. Several requests refused at the
 * same moment share one prompt.
 */

export class StepUpCancelledError extends Error {
  constructor() {
    super('The authenticator code was not entered.')
    this.name = 'StepUpCancelledError'
  }
}

interface Waiter {
  resolve: () => void
  reject: (reason: Error) => void
}

interface StepUpState {
  isOpen: boolean
  /** Dialogs on screen that can answer a request. With none, a request fails at once. */
  hosts: number
  waiters: Waiter[]
  addHost: () => void
  removeHost: () => void
  /** The code was accepted: repeat the refused requests. */
  complete: () => void
  /** The prompt was closed: the refused requests fail with their original error. */
  cancel: () => void
}

export const useStepUpStore = create<StepUpState>((set, get) => ({
  isOpen: false,
  hosts: 0,
  waiters: [],
  addHost: () => set((state) => ({ hosts: state.hosts + 1 })),
  removeHost: () => {
    const hosts = Math.max(0, get().hosts - 1)
    set({ hosts })
    if (hosts === 0) {
      // Leaving the console while the prompt is open: nobody can answer it any more.
      get().cancel()
    }
  },
  complete: () => {
    const { waiters } = get()
    set({ isOpen: false, waiters: [] })
    waiters.forEach((waiter) => waiter.resolve())
  },
  cancel: () => {
    const { waiters } = get()
    set({ isOpen: false, waiters: [] })
    waiters.forEach((waiter) => waiter.reject(new StepUpCancelledError()))
  },
}))

export function requestStepUp(): Promise<void> {
  const { hosts } = useStepUpStore.getState()
  if (hosts === 0) {
    return Promise.reject(new StepUpCancelledError())
  }
  return new Promise<void>((resolve, reject) => {
    useStepUpStore.setState((state) => ({
      isOpen: true,
      waiters: [...state.waiters, { resolve, reject }],
    }))
  })
}
