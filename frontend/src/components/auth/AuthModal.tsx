import { useEffect, useId, useRef } from 'react'

import { trapFocusKeyDown } from '../../lib/focusTrap'
import { useCartUiStore } from '../../store/cartUiStore'
import { useAuthUiStore } from '../../store/authUiStore'
import { AuthLoginPanel } from './AuthLoginPanel'
import { AuthRegisterPanel } from './AuthRegisterPanel'

export function AuthModal() {
  const isOpen = useAuthUiStore((state) => state.isOpen)
  const mode = useAuthUiStore((state) => state.mode)
  const closeAuthModal = useAuthUiStore((state) => state.close)
  const closeCartDrawer = useCartUiStore((state) => state.closeDrawer)
  const dialogRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!isOpen) {
      return
    }

    closeCartDrawer()
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusTimer = window.setTimeout(() => {
      const firstField = dialogRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), button, textarea, select',
      )
      firstField?.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAuthModal()
        return
      }

      const dialog = dialogRef.current
      if (dialog) {
        trapFocusKeyDown(event, dialog)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [closeAuthModal, closeCartDrawer, isOpen, mode])

  if (!isOpen) {
    return null
  }

  const panelTitleId = mode === 'login' ? `${titleId}-login` : `${titleId}-register`

  return (
    <div className="auth-modal" role="presentation">
      <button
        type="button"
        className="auth-modal__backdrop"
        aria-label="Close sign in dialog"
        onClick={closeAuthModal}
      />
      <section
        ref={dialogRef}
        className="auth-card auth-card--market auth-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={panelTitleId}
      >
        <button
          type="button"
          className="auth-modal__close"
          aria-label="Close sign in dialog"
          onClick={closeAuthModal}
        >
          ×
        </button>

        {mode === 'login' ? (
          <AuthLoginPanel titleId={panelTitleId} />
        ) : (
          <AuthRegisterPanel titleId={panelTitleId} />
        )}
      </section>
    </div>
  )
}
