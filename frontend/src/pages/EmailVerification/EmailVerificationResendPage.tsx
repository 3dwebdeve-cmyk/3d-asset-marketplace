import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { useEmailVerificationResendForm } from './useEmailVerificationResendForm'

export function EmailVerificationResendPage() {
  const { register, handleSubmit, errors, isSubmitting, serverError, successMessage, onSubmit } =
    useEmailVerificationResendForm()

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="verify-resend-title">
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">3D Asset Marketplace</p>
          <h1 id="verify-resend-title">Resend verification email</h1>
          <p className="auth-card__subtitle">
            Enter your email and we will send a new link to verify your account.
          </p>
        </header>

        {serverError ? <Alert variant="error" message={serverError} /> : null}
        {successMessage ? <Alert variant="success" message={successMessage} /> : null}

        {!successMessage ? (
          <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <FormField id="email" label="Email address" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                hasError={Boolean(errors.email)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
              />
            </FormField>

            <Button type="submit" isLoading={isSubmitting}>
              Send verification link
            </Button>
          </form>
        ) : null}

        <p className="auth-card__footer">
          <Link className="auth-link" to="/login">
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  )
}
