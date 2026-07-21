import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useToastStore, type Toast } from '../../store/toastStore'

const VARIANT_ICON: Record<Toast['variant'], string> = {
  success: '\u2713',
  error: '\u2715',
  info: '\u2139',
}

interface ToastItemProps {
  toast: Toast
  onDismiss: (id: string) => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [isLeaving, setIsLeaving] = useState(false)
  const leavingRef = useRef(false)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const beginDismiss = useCallback(() => {
    if (leavingRef.current) {
      return
    }
    leavingRef.current = true
    setIsLeaving(true)
    dismissTimer.current = setTimeout(() => onDismiss(toast.id), 180)
  }, [onDismiss, toast.id])

  useEffect(() => {
    if (toast.duration <= 0) {
      return
    }
    const autoTimer = setTimeout(beginDismiss, toast.duration)
    return () => clearTimeout(autoTimer)
  }, [toast.duration, beginDismiss])

  useEffect(
    () => () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current)
      }
    },
    [],
  )

  return (
    <div
      className={`toast toast--${toast.variant}${isLeaving ? ' toast--leaving' : ''}`}
      role={toast.variant === 'error' ? 'alert' : 'status'}
    >
      <span className="toast__icon" aria-hidden="true">
        {VARIANT_ICON[toast.variant]}
      </span>
      <p className="toast__message">{toast.message}</p>
      <button
        type="button"
        className="toast__close"
        aria-label="Dismiss notification"
        onClick={beginDismiss}
      >
        &times;
      </button>
    </div>
  )
}

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismissToast = useToastStore((state) => state.dismissToast)

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="toast-viewport" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>,
    document.body,
  )
}
