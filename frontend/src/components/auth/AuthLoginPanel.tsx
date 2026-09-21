import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AuthIconField } from './AuthIconField'
import { AuthModeTabs } from './AuthModeTabs'
import { AuthSubmitArrow } from './AuthSubmitArrow'
import { GoogleSignInButton } from './GoogleSignInButton'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { useGoogleLogin } from '../../hooks/useGoogleLogin'
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
}: AuthLoginPanelProps) {
  const navigate = useNavigate()
  const closeAuthModal = useAuthUiStore((state) => state.close)
  const returnTo = useAuthUiStore((state) => state.returnTo)
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
  const {
    isSubmitting: isGoogleSubmitting,
    serverError: googleError,
    isSuccess: isGoogleSuccess,
    signInWithGoogle,
  } = useGoogleLogin()

  useEffect(() => {
    if (!isSuccess && !isGoogleSuccess) {
      return
    }

    const role = useAuthStore.getState().user?.role
    closeAuthModal()
    navigate(isAdministrator(role) ? '/console' : (returnTo ?? '/dashboard'), {
      replace: true,
    })
  }, [closeAuthModal, isGoogleSuccess, isSuccess, navigate, returnTo])

  const showAdminLoginHint =
    Boolean(serverError || googleError) &&
    (serverError ?? googleError)?.toLowerCase().includes('admin sign-in')

  const handleForgotPassword = () => {
    closeAuthModal()
    void navigate('/forgot-password')
  }

  const handleResendVerification = () => {
    closeAuthModal()
    void navigate('/verify-email/resend')
  }

  const displayError = serverError ?? googleError

  return (
    <>
      <AuthModeTabs active="login" />

      <header className="auth-card__header">
        <h1 id={titleId}>Welcome back</h1>
        <p className="auth-card__subtitle">
          Sign in to access your 3D assets, project briefs, and licenses.
        </p>
      </header>

      {displayError ? <Alert variant="error" message={displayError} /> : null}

      {emailNotVerified ? (
        <p className="auth-card__footer">
          <button
            type="button"
            className="auth-link auth-link--button"
            onClick={handleResendVerification}
          >
            Resend verification email
          </button>
        </p>
      ) : null}

      {showAdminLoginHint ? (
        <p className="auth-card__footer">
          <Link className="auth-link" to="/console/login" onClick={closeAuthModal}>
            Go to admin sign in
          </Link>
        </p>
      ) : null}

      <GoogleSignInButton
        onCredential={signInWithGoogle}
        disabled={isSubmitting || isGoogleSubmitting}
        text="continue_with"
      />

      <div className="auth-divider" role="separator" aria-label="or use email credential">
        <span>Or use email credential</span>
      </div>

      <form
        className="auth-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        aria-labelledby={titleId}
      >
        <AuthIconField
          id="auth-email"
          label="Email ID"
          type="email"
          autoComplete="email"
          placeholder="artist@studio.com"
          hasError={Boolean(errors.email)}
          error={errors.email?.message}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'auth-email-error' : undefined}
          {...register('email')}
        />

        <AuthIconField
          id="auth-password"
          label="Password"
          revealable
          autoComplete="current-password"
          hasError={Boolean(errors.password)}
          error={errors.password?.message}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'auth-password-error' : undefined}
          labelAside={
            <button
              type="button"
              className="auth-link auth-form__forgot auth-link--button"
              onClick={handleForgotPassword}
            >
              Forgot password?
            </button>
          }
          {...register('password')}
        />

        <label className="auth-check" htmlFor="auth-remember_me">
          <input
            id="auth-remember_me"
            type="checkbox"
            className="auth-check__input"
            {...register('remember_me')}
          />
          <span className="auth-check__label">Remember this device for 30 days</span>
        </label>

        <Button
          type="submit"
          className="auth-submit"
          isLoading={isSubmitting || isGoogleSubmitting}
        >
          Sign in to 3D Hub
          <AuthSubmitArrow />
        </Button>
      </form>
    </>
  )
}
