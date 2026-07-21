import { Link, useParams } from 'react-router-dom'

import { Alert } from '../../components/ui/Alert'
import { Spinner } from '../../components/ui/Spinner'
import { useEmailVerification } from './useEmailVerification'

export function EmailVerificationPage() {
  const { uid = '', token = '' } = useParams<{ uid: string; token: string }>()
  const hasLink = Boolean(uid && token)
  const { isVerifying, serverError, successMessage } = useEmailVerification(uid, token)

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="verify-email-title">
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">3D Asset Marketplace</p>
          <h1 id="verify-email-title">Verify your email</h1>
          <p className="auth-card__subtitle">
            We are confirming your email address so you can sign in securely.
          </p>
        </header>

        {!hasLink ? (
          <Alert
            variant="error"
            message="This verification link is incomplete. Request a new verification email."
          />
        ) : null}

        {hasLink && isVerifying ? <Spinner label="Verifying your email..." /> : null}

        {serverError ? <Alert variant="error" message={serverError} /> : null}
        {successMessage ? <Alert variant="success" message={successMessage} /> : null}

        <p className="auth-card__footer">
          {successMessage ? (
            <Link className="auth-link" to="/login">
              Continue to sign in
            </Link>
          ) : (
            <Link className="auth-link" to="/verify-email/resend">
              Resend verification email
            </Link>
          )}
        </p>
      </section>
    </main>
  )
}
