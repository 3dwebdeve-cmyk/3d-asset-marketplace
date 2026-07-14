import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { useLoginForm } from './useLoginForm'
import '../../styles/auth.css'

export function LoginPage() {
  const navigate = useNavigate()
  const { register, handleSubmit, errors, isSubmitting, serverError, isSuccess, onSubmit } =
    useLoginForm()

  useEffect(() => {
    if (isSuccess) {
      navigate('/', { replace: true })
    }
  }, [isSuccess, navigate])

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">3D Asset Marketplace</p>
          <h1 id="login-title">Sign in</h1>
          <p className="auth-card__subtitle">
            Welcome back. Sign in to access your account and purchases.
          </p>
        </header>

        {serverError ? <Alert variant="error" message={serverError} /> : null}

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

          <FormField id="password" label="Password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              hasError={Boolean(errors.password)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
          </FormField>

          <Button type="submit" isLoading={isSubmitting}>
            Sign in
          </Button>
        </form>

        <p className="auth-card__footer">
          Don&apos;t have an account?{' '}
          <Link className="auth-link" to="/register">
            Create one
          </Link>
        </p>
      </section>
    </main>
  )
}
