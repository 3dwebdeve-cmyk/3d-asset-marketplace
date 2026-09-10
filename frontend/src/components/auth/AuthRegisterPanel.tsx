import { useNavigate } from 'react-router-dom'

import { AuthIconField } from './AuthIconField'
import { AuthModeTabs } from './AuthModeTabs'
import { AuthSubmitArrow } from './AuthSubmitArrow'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { useAuthUiStore } from '../../store/authUiStore'
import { useRegisterForm } from '../../pages/Register/useRegisterForm'

interface AuthRegisterPanelProps {
  titleId?: string
  onSwitchToLogin?: () => void
}

export function AuthRegisterPanel({
  titleId = 'auth-register-title',
  onSwitchToLogin,
}: AuthRegisterPanelProps) {
  const navigate = useNavigate()
  const closeAuthModal = useAuthUiStore((state) => state.close)
  const setMode = useAuthUiStore((state) => state.setMode)
  const {
    register,
    handleSubmit,
    errors,
    isSubmitting,
    serverError,
    registeredUser,
    onSubmit,
  } = useRegisterForm()

  const handleResendVerification = () => {
    closeAuthModal()
    void navigate('/verify-email/resend')
  }

  const handleSwitchToLogin = () => {
    if (onSwitchToLogin) {
      onSwitchToLogin()
      return
    }
    setMode('login')
  }

  if (registeredUser) {
    return (
      <>
        <h1 id={titleId}>Account created</h1>
        <Alert
          variant="success"
          message={`Welcome, ${registeredUser.full_name}. Check your email to verify your account before signing in.`}
        />
        <p className="auth-card__hint">
          We sent a verification link to {registeredUser.email}. Locally, copy the
          labeled link from the backend terminal, or ask an admin to mark the
          account verified.
        </p>
        <p className="auth-card__footer">
          <button
            type="button"
            className="auth-link auth-link--button"
            onClick={handleResendVerification}
          >
            Resend verification email
          </button>
        </p>
        <p className="auth-card__footer">
          <button
            type="button"
            className="auth-link auth-link--button"
            onClick={handleSwitchToLogin}
          >
            Continue to sign in
          </button>
        </p>
      </>
    )
  }

  return (
    <>
      <AuthModeTabs active="register" />

      <header className="auth-card__header">
        <h1 id={titleId}>Create an account</h1>
        <p className="auth-card__subtitle">
          Join 3D Asset Marketplace to publish, purchase, and manage 3D assets.
        </p>
      </header>

      {serverError ? <Alert variant="error" message={serverError} /> : null}

      <form
        className="auth-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        aria-labelledby={titleId}
      >
        <AuthIconField
          id="auth-full_name"
          label="Full Name"
          icon="user"
          type="text"
          autoComplete="name"
          placeholder="John Doe"
          hasError={Boolean(errors.full_name)}
          error={errors.full_name?.message}
          aria-invalid={Boolean(errors.full_name)}
          aria-describedby={errors.full_name ? 'auth-full_name-error' : undefined}
          {...register('full_name')}
        />

        <AuthIconField
          id="auth-register-email"
          label="Email Address"
          icon="mail"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          hasError={Boolean(errors.email)}
          error={errors.email?.message}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'auth-register-email-error' : undefined}
          {...register('email')}
        />

        <AuthIconField
          id="auth-phone"
          label="Phone (optional)"
          icon="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          hasError={Boolean(errors.phone)}
          error={errors.phone?.message}
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? 'auth-phone-error' : undefined}
          {...register('phone')}
        />

        <AuthIconField
          id="auth-country"
          label="Country (optional)"
          icon="globe"
          type="text"
          autoComplete="country-name"
          placeholder="India"
          hasError={Boolean(errors.country)}
          error={errors.country?.message}
          aria-invalid={Boolean(errors.country)}
          aria-describedby={errors.country ? 'auth-country-error' : undefined}
          {...register('country')}
        />

        <AuthIconField
          id="auth-register-password"
          label="Password"
          icon="lock"
          revealable
          autoComplete="new-password"
          hasError={Boolean(errors.password)}
          error={errors.password?.message}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'auth-register-password-error' : undefined}
          {...register('password')}
        />

        <AuthIconField
          id="auth-password_confirm"
          label="Confirm Password"
          icon="lock"
          revealable
          autoComplete="new-password"
          hasError={Boolean(errors.password_confirm)}
          error={errors.password_confirm?.message}
          aria-invalid={Boolean(errors.password_confirm)}
          aria-describedby={
            errors.password_confirm ? 'auth-password_confirm-error' : undefined
          }
          {...register('password_confirm')}
        />

        <Button type="submit" className="auth-submit" isLoading={isSubmitting}>
          Create Account
          <AuthSubmitArrow />
        </Button>
      </form>

      <p className="auth-card__footer auth-card__footer--center">
        Already have an account?{' '}
        <button
          type="button"
          className="auth-link auth-link--underline auth-link--button"
          onClick={handleSwitchToLogin}
        >
          Sign in here
        </button>
      </p>
    </>
  )
}
