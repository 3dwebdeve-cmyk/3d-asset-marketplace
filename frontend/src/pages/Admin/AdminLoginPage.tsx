import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/ui/FormField'
import { Input } from '../../components/ui/Input'
import { ADMIN_BASE } from '../../config/adminPaths'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { isAdministrator } from '../../lib/roles'
import { useAuthStore } from '../../store/authStore'
import { AdminMfaStep } from './AdminMfaStep'
import { useAdminLoginForm } from './useAdminLoginForm'

export function AdminLoginPage() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const {
    register,
    handleSubmit,
    errors,
    isSubmitting,
    serverError,
    isSuccess,
    onSubmit,
    mfaPending,
    completeSignIn,
    restartSignIn,
  } = useAdminLoginForm()

  useDocumentSeo({
    title: 'Admin sign in | AssetHive3D',
    description: 'Administrator sign-in for the marketplace control panel.',
    robots: 'noindex, nofollow',
  })

  useEffect(() => {
    if (isSuccess) {
      navigate(ADMIN_BASE, { replace: true })
    }
  }, [isSuccess, navigate])

  if (isAuthenticated && isAdministrator(user?.role)) {
    return <Navigate to={ADMIN_BASE} replace />
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  if (mfaPending) {
    return (
      <main className="auth-page">
        <AdminMfaStep
          pending={mfaPending}
          onComplete={completeSignIn}
          onRestart={restartSignIn}
        />
      </main>
    )
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="admin-login-title">
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">Administrator access</p>
          <h1 id="admin-login-title">Admin sign in</h1>
          <p className="auth-card__subtitle">
            Sign in with an administrator account to manage the platform.
          </p>
        </header>

        {serverError ? <Alert variant="error" message={serverError} /> : null}

        <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormField id="admin-email" label="Email address" error={errors.email?.message}>
            <Input
              id="admin-email"
              type="email"
              autoComplete="username"
              hasError={Boolean(errors.email)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'admin-email-error' : undefined}
              {...register('email')}
            />
          </FormField>

          <FormField
            id="admin-password"
            label="Password"
            error={errors.password?.message}
          >
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              hasError={Boolean(errors.password)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'admin-password-error' : undefined}
              {...register('password')}
            />
          </FormField>

          <Button type="submit" isLoading={isSubmitting}>
            Sign in
          </Button>
        </form>
      </section>
    </main>
  )
}
