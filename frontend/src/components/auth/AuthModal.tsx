import { Suspense, use, useEffect, useId, useRef, type RefObject } from 'react'

import { trapFocusKeyDown } from '../../lib/focusTrap'
import { useCartUiStore } from '../../store/cartUiStore'
import { useAuthUiStore, type AuthUiMode } from '../../store/authUiStore'
import { ErrorBoundary } from '../ErrorBoundary'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/Spinner'
import { loadAuthPanels, loadedAuthPanels } from './loadAuthPanels'

function focusFirstField(dialog: HTMLElement | null) {
  const firstField = dialog?.querySelector<HTMLElement>('input:not([type="hidden"]), button, textarea, select')
  ;(firstField ?? dialog)?.focus()
}

interface AuthDialogProps {
  mode: AuthUiMode
  dialogRef: RefObject<HTMLElement | null>
}

function AuthDialog({ mode, dialogRef }: AuthDialogProps) {
  // The forms are downloaded on first use (see loadAuthPanels.ts). Until they arrive the modal shows
  // only the backdrop and a spinner, so the card never opens small and then grows.
  const { AuthLoginPanel, AuthRegisterPanel } = loadedAuthPanels() ?? use(loadAuthPanels())
  const titleId = useId()
  const panelTitleId = mode === 'login' ? `${titleId}-login` : `${titleId}-register`

  useEffect(() => {
    // Runs once the form is on screen, also when it arrived after the modal opened.
    const focusTimer = window.setTimeout(() => focusFirstField(dialogRef.current), 0)
    return () => window.clearTimeout(focusTimer)
  }, [dialogRef, mode])

  return (
    <section
      ref={dialogRef}
      className="auth-card auth-card--market auth-modal__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={panelTitleId}
      tabIndex={-1}
      data-testid="customer-auth-dialog"
    >
      {mode === 'login' ? (
        <AuthLoginPanel titleId={panelTitleId} />
      ) : (
        <AuthRegisterPanel titleId={panelTitleId} />
      )}
    </section>
  )
}

export function AuthModal() {
  const isOpen = useAuthUiStore((state) => state.isOpen)
  const mode = useAuthUiStore((state) => state.mode)
  const closeAuthModal = useAuthUiStore((state) => state.close)
  const closeCartDrawer = useCartUiStore((state) => state.closeDrawer)
  const dialogRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    closeCartDrawer()
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAuthModal()
        return
      }

      const dialog = dialogRef.current
      if (dialog) {
        trapFocusKeyDown(event, dialog)
      } else if (event.key === 'Tab') {
        // The form is still downloading: keep focus from moving to the page behind the modal.
        event.preventDefault()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [closeAuthModal, closeCartDrawer, isOpen, mode])

  if (!isOpen) {
    return null
  }

  return (
    <div className="auth-modal" role="presentation">
      <button
        type="button"
        className="auth-modal__backdrop"
        aria-label="Close sign in dialog"
        onClick={closeAuthModal}
      />
      <ErrorBoundary
        fallback={(retry) => (
          <div className="auth-modal__status" role="alert">
            <p>Sign in could not be loaded. Check your connection and try again.</p>
            <Button onClick={retry}>Try again</Button>
          </div>
        )}
      >
        <Suspense
          fallback={
            <div className="auth-modal__status">
              <Spinner label="Loading sign in" />
            </div>
          }
        >
          <AuthDialog mode={mode} dialogRef={dialogRef} />
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}
