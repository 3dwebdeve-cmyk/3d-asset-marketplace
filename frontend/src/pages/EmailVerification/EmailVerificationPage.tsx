import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { Link, useParams } from 'react-router-dom'

import { AuthEntryButton } from '../../components/auth/AuthEntryButton'
import { Alert } from '../../components/ui/Alert'
import { Spinner } from '../../components/ui/Spinner'
import { useEmailVerification } from './useEmailVerification'

export function EmailVerificationPage() {
  useDocumentSeo({
    title: 'Verify your email | AssetHive 3D',
    description: 'Confirm the email address on your AssetHive 3D account.',
    robots: 'noindex, nofollow',
  })

  const { uid = '', token = '' } = useParams<{ uid: string; token: string }>()
  const hasLink = Boolean(uid && token)
  const { isVerifying, serverError, successMessage } = useEmailVerification(uid, token)

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="verify-email-title">
        <header className="auth-card__header">
          <p className="auth-card__eyebrow">AssetHive3D</p>
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
            <AuthEntryButton mode="login" className="auth-link auth-link--button">
              Continue to sign in
            </AuthEntryButton>
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
