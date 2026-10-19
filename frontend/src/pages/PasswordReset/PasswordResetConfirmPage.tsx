import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { useParams } from 'react-router-dom'

import { AuthEntryButton } from '../../components/auth/AuthEntryButton'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { usePasswordResetConfirmForm } from './usePasswordResetConfirmForm'

export function PasswordResetConfirmPage() {
  useDocumentSeo({
    title: 'Choose a new password | AssetHive 3D',
    description: 'Set a new password for your AssetHive 3D account.',
    robots: 'noindex, nofollow',
  })

  const { uid = '', token = '' } = useParams<{ uid: string; token: string }>()
  const hasLink = Boolean(uid && token)
  const { register, handleSubmit, errors, isSubmitting, serverError, successMessage, onSubmit } =
    usePasswordResetConfirmForm(uid, token)

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="reset-confirm-title">
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">AssetHive3D</p>
          <h1 id="reset-confirm-title">Choose a new password</h1>
          <p className="auth-card__subtitle">
            Enter and confirm your new password to finish resetting your account.
          </p>
        </header>

        {!hasLink ? (
          <Alert
            variant="error"
            message="This reset link is incomplete. Request a new password reset email."
          />
        ) : null}

        {serverError ? <Alert variant="error" message={serverError} /> : null}
        {successMessage ? <Alert variant="success" message={successMessage} /> : null}

        {hasLink && !successMessage ? (
          <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <FormField
              id="new_password"
              label="New password"
              error={errors.new_password?.message}
            >
              <Input
                id="new_password"
                type="password"
                autoComplete="new-password"
                hasError={Boolean(errors.new_password)}
                aria-invalid={Boolean(errors.new_password)}
                aria-describedby={errors.new_password ? 'new_password-error' : undefined}
                {...register('new_password')}
              />
            </FormField>

            <FormField
              id="new_password_confirm"
              label="Confirm new password"
              error={errors.new_password_confirm?.message}
            >
              <Input
                id="new_password_confirm"
                type="password"
                autoComplete="new-password"
                hasError={Boolean(errors.new_password_confirm)}
                aria-invalid={Boolean(errors.new_password_confirm)}
                aria-describedby={
                  errors.new_password_confirm ? 'new_password_confirm-error' : undefined
                }
                {...register('new_password_confirm')}
              />
            </FormField>

            <Button type="submit" isLoading={isSubmitting}>
              Reset password
            </Button>
          </form>
        ) : null}

        <p className="auth-card__footer">
          <AuthEntryButton mode="login" className="auth-link auth-link--button">
            Back to sign in
          </AuthEntryButton>
        </p>
      </section>
    </main>
  )
}
