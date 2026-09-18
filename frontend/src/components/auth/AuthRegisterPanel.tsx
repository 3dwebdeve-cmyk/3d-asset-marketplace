import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AuthIconField } from './AuthIconField'
import { AuthModeTabs } from './AuthModeTabs'
import { AuthSubmitArrow } from './AuthSubmitArrow'
import { GoogleSignInButton } from './GoogleSignInButton'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { useGoogleLogin } from '../../hooks/useGoogleLogin'
import { isAdministrator } from '../../lib/roles'
import { PRIVACY_PATH, TERMS_PATH } from '../../lib/legalDocuments'
import { useAuthStore } from '../../store/authStore'
import { useAuthUiStore } from '../../store/authUiStore'
import { useRegisterForm } from '../../pages/Register/useRegisterForm'

interface AuthRegisterPanelProps {
  titleId?: string
  onSwitchToLogin?: () => void
}

function passwordSecurityScore(password: string): number {
  let score = 0
  if (password.length >= 8) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  return score
}

export function AuthRegisterPanel({
  titleId = 'auth-register-title',
  onSwitchToLogin,
}: AuthRegisterPanelProps) {
  const navigate = useNavigate()
  const closeAuthModal = useAuthUiStore((state) => state.close)
  const returnTo = useAuthUiStore((state) => state.returnTo)
  const setMode = useAuthUiStore((state) => state.setMode)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [termsError, setTermsError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    errors,
    isSubmitting,
    serverError,
    registeredUser,
    onSubmit,
  } = useRegisterForm()
  const {
    isSubmitting: isGoogleSubmitting,
    serverError: googleError,
    isSuccess: isGoogleSuccess,
    signInWithGoogle,
  } = useGoogleLogin()

  const passwordValue = watch('password') ?? ''
  const securityScore = useMemo(
    () => passwordSecurityScore(passwordValue),
    [passwordValue],
  )

  useEffect(() => {
    if (!isGoogleSuccess) {
      return
    }

    const role = useAuthStore.getState().user?.role
    closeAuthModal()
    navigate(isAdministrator(role) ? '/console' : (returnTo ?? '/dashboard'), {
      replace: true,
    })
  }, [closeAuthModal, isGoogleSuccess, navigate, returnTo])

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
        <h1 id={titleId}>Check your email</h1>
        <Alert
          variant="success"
          message={`Welcome, ${registeredUser.full_name}. We sent a verification link to ${registeredUser.email}.`}
        />
        <p className="auth-card__hint">
          Open the link to verify your email, then sign in. Didn&apos;t get it?{' '}
          <Link
            className="auth-link"
            to="/verify-email/resend"
            onClick={() => closeAuthModal()}
          >
            Resend verification email
          </Link>
          .
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

  const displayError = serverError ?? googleError

  return (
    <>
      <AuthModeTabs active="register" />

      <header className="auth-card__header">
        <h1 id={titleId}>Create Studio Account</h1>
        <p className="auth-card__subtitle">
          Join technical artists, environment modelers, and VFX leads.
        </p>
      </header>

      {displayError ? <Alert variant="error" message={displayError} /> : null}

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
        onSubmit={handleSubmit((values) => {
          if (!acceptedTerms) {
            setTermsError('Please accept the terms to continue.')
            return
          }
          setTermsError(null)
          onSubmit(values)
        })}
        noValidate
        aria-labelledby={titleId}
      >
        <AuthIconField
          id="auth-full_name"
          label="Full Name"
          type="text"
          autoComplete="name"
          placeholder="e.g., John Doe"
          hasError={Boolean(errors.full_name)}
          error={errors.full_name?.message}
          aria-invalid={Boolean(errors.full_name)}
          aria-describedby={errors.full_name ? 'auth-full_name-error' : undefined}
          {...register('full_name')}
        />

        <AuthIconField
          id="auth-register-email"
          label="Email ID"
          type="email"
          autoComplete="email"
          placeholder="artist@studio.com"
          hasError={Boolean(errors.email)}
          error={errors.email?.message}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'auth-register-email-error' : undefined}
          {...register('email')}
        />

        <AuthIconField
          id="auth-phone"
          label="Phone Number"
          type="tel"
          autoComplete="tel"
          placeholder="+1 (555) 000-0000"
          hasError={Boolean(errors.phone)}
          error={errors.phone?.message}
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? 'auth-phone-error' : undefined}
          {...register('phone')}
        />

        <AuthIconField
          id="auth-country"
          label="Country (optional)"
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
          revealable
          autoComplete="new-password"
          hasError={Boolean(errors.password)}
          error={errors.password?.message}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={
            errors.password ? 'auth-register-password-error' : 'auth-password-score'
          }
          {...register('password')}
        />

        <div
          className="auth-password-score"
          id="auth-password-score"
          aria-live="polite"
        >
          <div className="auth-password-score__bars" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className={`auth-password-score__bar${
                  index < securityScore ? ' auth-password-score__bar--active' : ''
                }`}
              />
            ))}
          </div>
          <div className="auth-password-score__meta">
            <span>Security Score</span>
            <span>At least 8 characters</span>
          </div>
        </div>

        <AuthIconField
          id="auth-password_confirm"
          label="Confirm Password"
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

        <label className="auth-check" htmlFor="auth-terms">
          <input
            id="auth-terms"
            type="checkbox"
            className="auth-check__input"
            checked={acceptedTerms}
            onChange={(event) => {
              setAcceptedTerms(event.target.checked)
              if (event.target.checked) {
                setTermsError(null)
              }
            }}
          />
          <span className="auth-check__label">
            I agree to 3D Hub&apos;s{' '}
            <Link className="auth-link" to={TERMS_PATH} onClick={closeAuthModal}>
              Terms of Service
            </Link>
            {' '}and{' '}
            <Link className="auth-link" to={PRIVACY_PATH} onClick={closeAuthModal}>
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {termsError ? (
          <p className="form-field__error" role="alert">
            {termsError}
          </p>
        ) : null}

        <Button
          type="submit"
          className="auth-submit"
          isLoading={isSubmitting || isGoogleSubmitting}
        >
          Create free studio account
          <AuthSubmitArrow />
        </Button>
      </form>
    </>
  )
}
