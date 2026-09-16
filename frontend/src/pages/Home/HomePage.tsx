import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import { AuthEntryButton } from '../../components/auth/AuthEntryButton'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { useAuthStore } from '../../store/authStore'

export function HomePage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const clearPostLogoutRedirect = useAuthStore((state) => state.clearPostLogoutRedirect)

  useDocumentSeo({
    title: '3D Asset Marketplace',
    description:
      'Premium 3D models, plugins, and custom design services for creators worldwide.',
  })

  useEffect(() => {
    clearPostLogoutRedirect()
  }, [clearPostLogoutRedirect])

  return (
    <main className="home-page">
      <section className="home-page__hero">
        <div className="home-page__hero-inner">
          <p className="home-page__eyebrow">3D Asset Marketplace</p>
          <h1>Premium 3D assets for creators worldwide</h1>
          <p className="home-page__subtitle">
            Browse models, purchase plugins, and request custom design work from one
            platform.
          </p>
          <div className="home-page__actions">
            <Link className="home-page__cta" to="/home">
              Browse Marketplace
            </Link>
            <Link className="home-page__cta home-page__cta--secondary" to="/custom-projects">
              Request custom work
            </Link>
            {isAuthenticated ? (
              <Link className="home-page__cta home-page__cta--secondary" to="/dashboard">
                Go to dashboard
              </Link>
            ) : (
              <>
                <AuthEntryButton mode="register" returnTo="/" className="home-page__cta">
                  Create account
                </AuthEntryButton>
                <AuthEntryButton
                  mode="login"
                  returnTo="/"
                  className="home-page__cta home-page__cta--secondary"
                >
                  Sign in
                </AuthEntryButton>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
