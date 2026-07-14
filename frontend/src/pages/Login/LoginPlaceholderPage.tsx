import { Link } from 'react-router-dom'

export function LoginPlaceholderPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Sign in</h1>
        <p className="auth-card__hint">Login will be implemented in the next authentication task.</p>
        <Link className="auth-link" to="/register">
          Create an account instead
        </Link>
      </section>
    </main>
  )
}
