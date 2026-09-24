import { create } from 'zustand'

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  variant: ToastVariant
  message: string
  /** Auto-dismiss delay in ms. Use 0 to keep the toast until dismissed manually. */
  duration: number
}

export interface ToastInput {
  variant: ToastVariant
  message: string
  duration?: number
  /** Reuse this id to replace an existing toast instead of stacking a new one. */
  id?: string
}

interface ToastState {
  toasts: Toast[]
  addToast: (toast: ToastInput) => string
  dismissToast: (id: string) => void
  clearToasts: () => void
}

export const DEFAULT_TOAST_DURATION = 4000

let toastCounter = 0

function createToastId(): string {
  toastCounter += 1
  return `toast-${Date.now()}-${toastCounter}`
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: ({ id, variant, message, duration }) => {
    const toastId = id ?? createToastId()
    const nextToast: Toast = {
      id: toastId,
      variant,
      message,
      duration: duration ?? DEFAULT_TOAST_DURATION,
    }

    set((state) => {
      const withoutDuplicate = state.toasts.filter((toast) => toast.id !== toastId)
      return { toasts: [...withoutDuplicate, nextToast] }
    })

    return toastId
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  clearToasts: () => set({ toasts: [] }),
}))
