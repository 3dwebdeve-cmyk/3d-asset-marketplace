import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AuthIconField } from './AuthIconField'
import { AuthModeTabs } from './AuthModeTabs'
import { AuthSubmitArrow } from './AuthSubmitArrow'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { isAdministrator } from '../../lib/roles'
import { useAuthStore } from '../../store/authStore'
import { useAuthUiStore } from '../../store/authUiStore'
import { useLoginForm } from '../../pages/Login/useLoginForm'

interface AuthLoginPanelProps {
  titleId?: string
  onSwitchToRegister?: () => void
}

export function AuthLoginPanel({
  titleId = 'auth-login-title',
  onSwitchToRegister,
}: AuthLoginPanelProps) {
  const navigate = useNavigate()
  const closeAuthModal = useAuthUiStore((state) => state.close)
  const returnTo = useAuthUiStore((state) => state.returnTo)
  const setMode = useAuthUiStore((state) => state.setMode)
  const {
    register,
    handleSubmit,
    errors,
    isSubmitting,
    serverError,
    emailNotVerified,
    isSuccess,
    onSubmit,
  } = useLoginForm()

  useEffect(() => {
    if (!isSuccess) {
      return
    }

    const role = useAuthStore.getState().user?.role
    closeAuthModal()
    navigate(isAdministrator(role) ? '/admin' : (returnTo ?? '/dashboard'), {
      replace: true,
    })
  }, [closeAuthModal, isSuccess, navigate, returnTo])

  const showAdminLoginHint =
    Boolean(serverError) && serverError?.toLowerCase().includes('admin sign-in')

  const handleForgotPassword = () => {
    closeAuthModal()
    void navigate('/forgot-password')
  }

  const handleResendVerification = () => {
    closeAuthModal()
    void navigate('/verify-email/resend')
  }

  const handleSwitchToRegister = () => {
    if (onSwitchToRegister) {
      onSwitchToRegister()
      return
    }
    setMode('register')
  }

  return (
    <>
      <AuthModeTabs active="login" />

      <header className="auth-card__header">
        <h1 id={titleId}>Welcome back</h1>
        <p className="auth-card__subtitle">
          Sign in to access your 3D assets, licenses, and downloads.
        </p>
      </header>

      {serverError ? <Alert variant="error" message={serverError} /> : null}

      {showAdminLoginHint ? (
        <p className="auth-card__footer">
          <Link className="auth-link" to="/admin/login" onClick={closeAuthModal}>
            Go to admin sign in
          </Link>
        </p>
      ) : null}

      {emailNotVerified ? (
        <p className="auth-card__footer">
          <button type="button" className="auth-link auth-link--button" onClick={handleResendVerification}>
            Resend verification email
          </button>
        </p>
      ) : null}

      <form
        className="auth-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        aria-labelledby={titleId}
      >
        <AuthIconField
          id="auth-email"
          label="Email Address"
          icon="mail"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          hasError={Boolean(errors.email)}
          error={errors.email?.message}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'auth-email-error' : undefined}
          {...register('email')}
        />

        <AuthIconField
          id="auth-password"
          label="Password"
          icon="lock"
          revealable
          autoComplete="current-password"
          hasError={Boolean(errors.password)}
          error={errors.password?.message}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'auth-password-error' : undefined}
          {...register('password')}
        />

        <div className="auth-form__options">
          <label className="auth-check" htmlFor="auth-remember_me">
            <input
              id="auth-remember_me"
              type="checkbox"
              className="auth-check__input"
              {...register('remember_me')}
            />
            <span className="auth-check__label">Remember me</span>
          </label>
          <button
            type="button"
            className="auth-link auth-form__forgot auth-link--button"
            onClick={handleForgotPassword}
          >
            Forgot password?
          </button>
        </div>

        <Button type="submit" className="auth-submit" isLoading={isSubmitting}>
          Sign In
          <AuthSubmitArrow />
        </Button>
      </form>

      <p className="auth-card__footer auth-card__footer--center">
        Don&apos;t have an account?{' '}
        <button
          type="button"
          className="auth-link auth-link--underline auth-link--button"
          onClick={handleSwitchToRegister}
        >
          Register here
        </button>
      </p>
    </>
  )
}
