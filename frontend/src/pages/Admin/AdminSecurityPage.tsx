import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { getAdminRecoveryCodesStatus, replaceAdminRecoveryCodes } from '../../api/authApi'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'
import '../../styles/auth.css'

const STATUS_KEY = ['auth', 'admin', 'mfa', 'recovery-codes']

export function AdminSecurityPage() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [newCodes, setNewCodes] = useState<string[] | null>(null)

  const statusQuery = useQuery({ queryKey: STATUS_KEY, queryFn: getAdminRecoveryCodesStatus })

  const replaceMutation = useMutation({
    mutationFn: () => replaceAdminRecoveryCodes(code.trim()),
    onSuccess: (codes) => {
      setNewCodes(codes)
      setCode('')
      void queryClient.invalidateQueries({ queryKey: STATUS_KEY })
    },
  })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (code.trim()) {
      replaceMutation.mutate()
    }
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-card dashboard-card--wide" aria-labelledby="admin-security-title">
        <p className="admin-page__eyebrow">Administrator</p>
        <h1 id="admin-security-title">Security</h1>
        <p className="home-page__subtitle">
          Two-factor sign-in protects this console. Recovery codes sign you in once each if
          you lose your phone.
        </p>

        {statusQuery.isLoading ? <Spinner label="Loading security status..." /> : null}
        {statusQuery.isError ? (
          <ErrorState
            title="Could not load security status"
            description={getApiErrorMessage(statusQuery.error, 'Please try again.')}
            action={
              <Button variant="secondary" onClick={() => void statusQuery.refetch()}>
                Try again
              </Button>
            }
          />
        ) : null}

        {statusQuery.data ? (
          <p role="status">
            {statusQuery.data.enrolled
              ? `Recovery codes left: ${statusQuery.data.remaining} of 10.`
              : 'Two-factor sign-in is not set up for this account.'}
          </p>
        ) : null}

        {newCodes ? (
          <>
            <Alert
              variant="success"
              message="New recovery codes created. Your old codes no longer work. Save these now; they are shown only once."
            />
            <ol className="auth-card__recovery-codes" aria-label="Recovery codes">
              {newCodes.map((recoveryCode) => (
                <li key={recoveryCode}>
                  <code>{recoveryCode}</code>
                </li>
              ))}
            </ol>
          </>
        ) : null}

        {statusQuery.data?.enrolled ? (
          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <h2>Create new recovery codes</h2>
            {replaceMutation.isError ? (
              <Alert
                variant="error"
                message={getApiErrorMessage(replaceMutation.error, 'That code did not work.')}
              />
            ) : null}
            <FormField id="security-code" label="Current 6-digit code from your authenticator app">
              <Input
                id="security-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </FormField>
            <Button type="submit" isLoading={replaceMutation.isPending}>
              Create new codes
            </Button>
          </form>
        ) : null}
      </section>
    </main>
  )
}
