import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { adminMfaConfirm, adminMfaSetup, adminMfaVerify } from '../../api/authApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { getApiErrorCode, getApiErrorMessage } from '../../lib/apiError'
import type { AdminMfaConfirmResponse, LoginResponse } from '../../types/auth'
import type { AdminMfaPending } from './useAdminLoginForm'

interface AdminMfaStepProps {
  pending: AdminMfaPending
  onComplete: (data: LoginResponse, remember: boolean) => void
  onRestart: (message?: string) => void
}

const EXPIRED_MESSAGE = 'Your sign-in expired. Enter your email and password again.'

/** Groups of four make a setup key easier to type into an authenticator app. */
function groupKey(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret
}

function downloadCodes(codes: string[]): void {
  const blob = new Blob(
    [`AssetHive3D administrator recovery codes\nEach code works once.\n\n${codes.join('\n')}\n`],
    { type: 'text/plain' },
  )
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'marketplace-recovery-codes.txt'
  anchor.click()
  URL.revokeObjectURL(url)
}

export function AdminMfaStep({ pending, onComplete, onRestart }: AdminMfaStepProps) {
  const [code, setCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [issued, setIssued] = useState<AdminMfaConfirmResponse | null>(null)

  const setupQuery = useQuery({
    queryKey: ['auth', 'admin', 'mfa-setup', pending.mfaToken],
    queryFn: () => adminMfaSetup(pending.mfaToken),
    enabled: pending.setupRequired,
    retry: false,
    staleTime: Infinity,
  })

  const handleError = (error: unknown) => {
    if (getApiErrorCode(error) === 'mfa_expired') {
      onRestart(EXPIRED_MESSAGE)
    }
  }

  const confirmMutation = useMutation({
    mutationFn: () => adminMfaConfirm(pending.mfaToken, code.trim(), pending.remember),
    onSuccess: (data) => setIssued(data),
    onError: handleError,
  })

  const verifyMutation = useMutation({
    mutationFn: () =>
      adminMfaVerify({
        mfa_token: pending.mfaToken,
        remember_me: pending.remember,
        ...(useRecovery ? { recovery_code: code.trim() } : { code: code.trim() }),
      }),
    onSuccess: (data) => onComplete(data, pending.remember),
    onError: handleError,
  })

  const activeMutation = pending.setupRequired ? confirmMutation : verifyMutation
  const submitError = activeMutation.isError
    ? getApiErrorMessage(activeMutation.error, 'That code did not work. Try again.')
    : null

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (code.trim()) {
      activeMutation.mutate()
    }
  }

  if (issued) {
    return (
      <section className="auth-card" aria-labelledby="mfa-codes-title">
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">Two-factor sign-in is on</p>
          <h1 id="mfa-codes-title">Save your recovery codes</h1>
          <p className="auth-card__subtitle">
            If you lose your phone, each code signs you in once. They are shown only now.
            Keep them somewhere safe, away from this computer.
          </p>
        </header>
        <ol className="auth-card__recovery-codes" aria-label="Recovery codes">
          {issued.recovery_codes.map((recoveryCode) => (
            <li key={recoveryCode}>
              <code>{recoveryCode}</code>
            </li>
          ))}
        </ol>
        <div className="auth-form">
          <Button variant="secondary" onClick={() => downloadCodes(issued.recovery_codes)}>
            Download codes
          </Button>
          <Button onClick={() => onComplete(issued, pending.remember)}>
            I have saved these codes
          </Button>
        </div>
      </section>
    )
  }

  if (pending.setupRequired) {
    return (
      <section className="auth-card" aria-labelledby="mfa-setup-title">
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">Administrator access</p>
          <h1 id="mfa-setup-title">Set up two-factor sign-in</h1>
          <p className="auth-card__subtitle">
            Administrator accounts need a code from an authenticator app (Google
            Authenticator, Microsoft Authenticator, 1Password or similar) at every sign-in.
          </p>
        </header>

        {setupQuery.isError ? (
          <Alert
            variant="error"
            message={getApiErrorMessage(setupQuery.error, EXPIRED_MESSAGE)}
          />
        ) : null}

        {setupQuery.data ? (
          <div className="auth-card__setup">
            <p className="auth-card__hint">
              1. In your authenticator app, add an account and enter this setup key:
            </p>
            <p className="auth-card__setup-key">
              <code>{groupKey(setupQuery.data.secret)}</code>
            </p>
            <p className="auth-card__hint">
              On a phone, you can{' '}
              <a href={setupQuery.data.otpauth_uri}>open it in your authenticator app</a>{' '}
              instead.
            </p>
            <p className="auth-card__hint">2. Enter the 6-digit code the app shows.</p>
          </div>
        ) : (
          <p className="auth-card__hint" role="status">
            {setupQuery.isError ? null : 'Preparing your setup key…'}
          </p>
        )}

        {submitError ? <Alert variant="error" message={submitError} /> : null}

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <FormField id="mfa-code" label="6-digit code">
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </FormField>
          <Button type="submit" isLoading={confirmMutation.isPending} disabled={!setupQuery.data}>
            Turn on two-factor sign-in
          </Button>
          <Button variant="secondary" onClick={() => onRestart()}>
            Cancel
          </Button>
        </form>
      </section>
    )
  }

  return (
    <section className="auth-card" aria-labelledby="mfa-verify-title">
      <header className="auth-card__header">
        <p className="auth-card__eyebrow">Administrator access</p>
        <h1 id="mfa-verify-title">Two-factor sign-in</h1>
        <p className="auth-card__subtitle">
          {useRecovery
            ? 'Enter one of your recovery codes. Each code works once.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </p>
      </header>

      {submitError ? <Alert variant="error" message={submitError} /> : null}

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <FormField id="mfa-code" label={useRecovery ? 'Recovery code' : '6-digit code'}>
          <Input
            id="mfa-code"
            inputMode={useRecovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            maxLength={useRecovery ? 11 : 6}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </FormField>
        <Button type="submit" isLoading={verifyMutation.isPending}>
          Verify
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setUseRecovery((current) => !current)
            setCode('')
            verifyMutation.reset()
          }}
        >
          {useRecovery ? 'Use my authenticator app instead' : 'Use a recovery code instead'}
        </Button>
      </form>
    </section>
  )
}
