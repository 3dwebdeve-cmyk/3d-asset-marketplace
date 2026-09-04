import { Link } from 'react-router-dom'

import { useDocumentSeo } from '../../hooks/useDocumentSeo'

export function AboutPage() {
  useDocumentSeo({
    title: 'About the Studio | 3D Asset Marketplace',
    description:
      'Learn about our studio, marketplace of premium 3D assets and plugins, and custom design services.',
  })

  return (
    <main className="marketing-page">
      <div className="marketing-page__inner">
        <header className="marketing-page__intro" aria-labelledby="about-title">
          <p className="marketing-page__eyebrow">About the studio</p>
          <h1 id="about-title">Premium 3D assets and custom design, under one roof</h1>
          <p className="marketing-page__lead">
            We build and curate marketplace-ready 3D models and plugins, and we partner with
            creators who need bespoke design work through a clear project portal — from brief to
            delivery.
          </p>
        </header>

        <section className="marketing-section" aria-labelledby="about-mission">
          <h2 id="about-mission">Our mission</h2>
          <p>
            Creators deserve production-quality assets without guessing about licensing, file
            readiness, or support. Our marketplace focuses on carefully reviewed models and
            tools, while our custom project service gives you a structured way to request
            original work when off-the-shelf assets are not enough.
          </p>
        </section>

        <section className="marketing-section" aria-labelledby="about-offer">
          <h2 id="about-offer">What we offer</h2>
          <ul className="marketing-list">
            <li>
              <strong>3D model marketplace</strong>
              Browse and purchase high-quality models with clear specs, previews, and secure
              downloads after purchase.
            </li>
            <li>
              <strong>Plugin store</strong>
              Discover plugins and tools that fit your pipeline, with compatible software and
              documentation called out clearly.
            </li>
            <li>
              <strong>Custom projects</strong>
              Submit a brief, receive a quotation, collaborate through messaging and files, and
              track delivery in your dashboard.
            </li>
          </ul>
        </section>

        <section className="marketing-section" aria-labelledby="about-trust">
          <h2 id="about-trust">How we earn trust</h2>
          <p>
            Assets go through quality review before they appear in the catalog. Downloads are
            purchase-gated and audited. Custom work lives in a dedicated project portal with
            status tracking, quotations, and messaging — so you always know where things stand.
          </p>
        </section>

        <section className="marketing-section" aria-labelledby="about-cta">
          <h2 id="about-cta">Next steps</h2>
          <div className="marketing-actions">
            <Link className="home-page__cta" to="/products">
              Browse Models
            </Link>
            <Link className="home-page__cta home-page__cta--secondary" to="/custom-projects">
              Custom Projects
            </Link>
            <Link className="home-page__cta home-page__cta--secondary" to="/contact">
              Contact
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
