import { Link } from 'react-router-dom'

export function HomePage() {
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
          <Link className="home-page__cta" to="/register">
            Create account
          </Link>
        </div>
      </section>
    </main>
  )
}
