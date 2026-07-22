import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import { useAuthStore } from '../../store/authStore'

export function HomePage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const clearPostLogoutRedirect = useAuthStore((state) => state.clearPostLogoutRedirect)

  useEffect(() => {
    clearPostLogoutRedirect()
  }, [clearPostLogoutRedirect])

  return (
    <main className="home-page">
      <section className="home-page__hero">
        <p className="home-page__eyebrow">3D Asset Marketplace</p>
        <h1>Premium 3D assets for creators worldwide</h1>
        <p className="home-page__subtitle">
          Browse models, purchase plugins, and request custom design work from one
          platform.
        </p>
        <div className="home-page__actions">
          <Link className="home-page__cta" to="/products">
            Browse Marketplace
          </Link>
          {isAuthenticated ? (
            <Link className="home-page__cta home-page__cta--secondary" to="/dashboard">
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link className="home-page__cta" to="/register">
                Create account
              </Link>
              <Link className="home-page__cta home-page__cta--secondary" to="/login">
                Sign in
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
