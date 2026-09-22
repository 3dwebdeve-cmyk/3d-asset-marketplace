import { useToastStore, type ToastVariant } from '../store/toastStore'

export interface ToastOptions {
  /** Auto-dismiss delay in ms. Use 0 to keep the toast until dismissed manually. */
  duration?: number
  /** Reuse an id to replace an existing toast instead of stacking a new one. */
  id?: string
}

function show(variant: ToastVariant, message: string, options?: ToastOptions): string {
  return useToastStore.getState().addToast({
    variant,
    message,
    duration: options?.duration,
    id: options?.id,
  })
}

/**
 * Imperative toast API usable anywhere, including outside React components
 * (e.g. axios interceptors, zustand actions).
 *
 * Success toasts are intentionally no-ops — prefer silent success UX;
 * errors and info toasts still surface.
 */
export const toast = {
  success: (_message: string, _options?: ToastOptions) => '',
  error: (message: string, options?: ToastOptions) => show('error', message, options),
  info: (message: string, options?: ToastOptions) => show('info', message, options),
  dismiss: (id: string) => useToastStore.getState().dismissToast(id),
  clear: () => useToastStore.getState().clearToasts(),
}
