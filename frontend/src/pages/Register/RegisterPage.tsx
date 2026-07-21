import { Link } from 'react-router-dom'

import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { useRegisterForm } from './useRegisterForm'

export function RegisterPage() {
  const {
    register,
    handleSubmit,
    errors,
    isSubmitting,
    serverError,
    registeredUser,
    onSubmit,
  } = useRegisterForm()

  if (registeredUser) {
    return (
      <main className="auth-page">
        <section className="auth-card" aria-labelledby="register-success-title">
          <h1 id="register-success-title">Account created</h1>
          <Alert
            variant="success"
            message={`Welcome, ${registeredUser.full_name}. Check your email to verify your account before signing in.`}
          />
          <p className="auth-card__hint">
            We sent a verification link to {registeredUser.email}.
          </p>
          <p className="auth-card__footer">
            <Link className="auth-link" to="/verify-email/resend">
              Resend verification email
            </Link>
          </p>
          <p className="auth-card__footer">
            <Link className="auth-link" to="/login">
              Continue to sign in
            </Link>
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="register-title">
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">3D Asset Marketplace</p>
          <h1 id="register-title">Create your account</h1>
          <p className="auth-card__subtitle">
            Register to browse assets, save favorites, and purchase 3D models.
          </p>
        </header>

        {serverError ? <Alert variant="error" message={serverError} /> : null}

        <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormField id="full_name" label="Full name" error={errors.full_name?.message}>
            <Input
              id="full_name"
              type="text"
              autoComplete="name"
              hasError={Boolean(errors.full_name)}
              aria-invalid={Boolean(errors.full_name)}
              aria-describedby={errors.full_name ? 'full_name-error' : undefined}
              {...register('full_name')}
            />
          </FormField>

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

          <FormField id="phone" label="Phone (optional)" error={errors.phone?.message}>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              hasError={Boolean(errors.phone)}
              {...register('phone')}
            />
          </FormField>

          <FormField id="country" label="Country (optional)" error={errors.country?.message}>
            <Input
              id="country"
              type="text"
              autoComplete="country-name"
              hasError={Boolean(errors.country)}
              {...register('country')}
            />
          </FormField>

          <FormField id="password" label="Password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              hasError={Boolean(errors.password)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
          </FormField>

          <FormField
            id="password_confirm"
            label="Confirm password"
            error={errors.password_confirm?.message}
          >
            <Input
              id="password_confirm"
              type="password"
              autoComplete="new-password"
              hasError={Boolean(errors.password_confirm)}
              aria-invalid={Boolean(errors.password_confirm)}
              aria-describedby={
                errors.password_confirm ? 'password_confirm-error' : undefined
              }
              {...register('password_confirm')}
            />
          </FormField>

          <Button type="submit" isLoading={isSubmitting}>
            Create account
          </Button>
        </form>

        <p className="auth-card__footer">
          Already have an account?{' '}
          <Link className="auth-link" to="/login">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  )
}
