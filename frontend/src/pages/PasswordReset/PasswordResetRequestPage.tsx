import { AuthEntryButton } from '../../components/auth/AuthEntryButton'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { usePasswordResetRequestForm } from './usePasswordResetRequestForm'

export function PasswordResetRequestPage() {
  const { register, handleSubmit, errors, isSubmitting, serverError, successMessage, onSubmit } =
    usePasswordResetRequestForm()

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="reset-request-title">
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">AssetHive3D</p>
          <h1 id="reset-request-title">Forgot password</h1>
          <p className="auth-card__subtitle">
            Enter your email and we will send a link to reset your password.
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
              Send reset link
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
