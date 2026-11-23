import { useMutation } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { adminStepUp } from '../../api/authApi'
import { getApiErrorMessage } from '../../lib/apiError'
import { trapFocusKeyDown } from '../../lib/focusTrap'
import { useStepUpStore } from '../../store/stepUpStore'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { FormField } from '../ui/FormField'
import { Input } from '../ui/Input'

/**
 * Asks for a fresh authenticator code before a dangerous console action (see stepUpStore).
 * Mounted once by the console layout; it stays hidden until the server asks for a code.
 */
export function AdminStepUpDialog() {
  const isOpen = useStepUpStore((state) => state.isOpen)
  const addHost = useStepUpStore((state) => state.addHost)
  const removeHost = useStepUpStore((state) => state.removeHost)

  useEffect(() => {
    addHost()
    return () => removeHost()
  }, [addHost, removeHost])

  // A fresh prompt each time, so a code typed for an earlier action is never left behind.
  return isOpen ? <StepUpPrompt /> : null
}

function focusCodeField(dialog: HTMLElement | null) {
  dialog?.querySelector<HTMLInputElement>('#step-up-code')?.focus()
}

function StepUpPrompt() {
  const complete = useStepUpStore((state) => state.complete)
  const cancel = useStepUpStore((state) => state.cancel)
  const [code, setCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  const stepUpMutation = useMutation({
    mutationFn: () =>
      adminStepUp(useRecovery ? { recovery_code: code.trim() } : { code: code.trim() }),
  })

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    focusCodeField(dialogRef.current)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancel()
        return
      }
      if (dialogRef.current) {
        trapFocusKeyDown(event, dialogRef.current)
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [cancel])

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!code.trim() || stepUpMutation.isPending) {
      return
    }
    // Callbacks given to mutate() do not run after the prompt closes, so a late answer cannot
    // repeat an action the administrator already cancelled.
    stepUpMutation.mutate(undefined, { onSuccess: () => complete() })
  }

  const switchMethod = () => {
    setUseRecovery((current) => !current)
    setCode('')
    stepUpMutation.reset()
    focusCodeField(dialogRef.current)
  }

  const submitError = stepUpMutation.isError
    ? getApiErrorMessage(stepUpMutation.error, 'That code did not work. Try again.')
    : null

  return (
    <div className="auth-modal" role="presentation">
      <button
        type="button"
        className="auth-modal__backdrop"
        aria-label="Cancel and close"
        tabIndex={-1}
        onClick={cancel}
      />
      <section
        ref={dialogRef}
        className="auth-card auth-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-testid="admin-step-up-dialog"
      >
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">Protected action</p>
          <h2 id={titleId}>Confirm it&apos;s you</h2>
          <p id={descriptionId} className="auth-card__subtitle">
            {useRecovery
              ? 'Enter one of your recovery codes. Each code works once.'
              : 'Open your authenticator app and enter the 6-digit code for 3D Asset Marketplace.'}
          </p>
        </header>

        {submitError ? <Alert variant="error" message={submitError} /> : null}

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <FormField id="step-up-code" label={useRecovery ? 'Recovery code' : '6-digit code'}>
            <Input
              id="step-up-code"
              inputMode={useRecovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              maxLength={useRecovery ? 11 : 6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </FormField>
          <p className="auth-card__hint">
            Other protected actions will not ask again for the next few minutes.
          </p>
          <Button type="submit" isLoading={stepUpMutation.isPending}>
            Confirm
          </Button>
          <Button variant="secondary" onClick={switchMethod}>
            {useRecovery ? 'Use my authenticator app instead' : 'Use a recovery code instead'}
          </Button>
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
        </form>
      </section>
    </div>
  )
}
