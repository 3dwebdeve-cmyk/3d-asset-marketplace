import { Link } from 'react-router-dom'

import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { isAdministrator } from '../../lib/roles'
import { useAuthStore } from '../../store/authStore'

const REQUEST_PATH = '/dashboard/projects/new'

export function CustomProjectsLandingPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const isAdmin = isAdministrator(user?.role)
  const canRequest = isAuthenticated && !isAdmin

  useDocumentSeo({
    title: 'Custom Projects | 3D Asset Marketplace',
    description:
      'Request custom 3D design work — submit a brief, receive a quote, collaborate, and track delivery in your project portal.',
  })

  return (
    <main className="marketing-page">
      <div className="marketing-page__inner">
        <section className="marketing-page__hero" aria-labelledby="custom-projects-title">
          <p className="marketing-page__eyebrow">Custom design services</p>
          <h1 id="custom-projects-title">Custom 3D projects, from concept to delivery</h1>
          <p className="marketing-page__lead">
            Need something that is not in the catalog? Tell us what you need, get a clear
            quotation, and work with our studio through a dedicated project portal — messaging,
            files, and status updates included.
          </p>
          <div className="marketing-actions">
            {canRequest ? (
              <Link className="home-page__cta" to={REQUEST_PATH}>
                Start a project request
              </Link>
            ) : isAdmin ? (
              <Link className="home-page__cta" to="/admin/projects">
                Open admin projects
              </Link>
            ) : (
              <Link
                className="home-page__cta"
                to="/login"
                state={{ from: { pathname: REQUEST_PATH } }}
              >
                Sign in to request a project
              </Link>
            )}
            {!isAuthenticated ? (
              <Link className="home-page__cta home-page__cta--secondary" to="/register">
                Create an account
              </Link>
            ) : null}
            <Link className="home-page__cta home-page__cta--secondary" to="/contact">
              Ask a question first
            </Link>
          </div>
        </section>

        <section className="marketing-section" aria-labelledby="how-it-works">
          <h2 id="how-it-works">How it works</h2>
          <ol className="marketing-steps">
            <li>
              <strong>Submit a request</strong>
              Share your title, description, budget range, and deadline from your dashboard.
            </li>
            <li>
              <strong>Review &amp; quote</strong>
              Our team reviews the brief and sends a quotation you can accept or discuss.
            </li>
            <li>
              <strong>Approve &amp; produce</strong>
              Once approved, work moves into production with messaging and file sharing.
            </li>
            <li>
              <strong>Delivery &amp; complete</strong>
              Receive deliverables through the portal and mark the project complete when ready.
            </li>
          </ol>
        </section>

        <section className="marketing-section" aria-labelledby="what-you-can-request">
          <h2 id="what-you-can-request">What you can request</h2>
          <ul className="marketing-list">
            <li>
              <strong>Characters &amp; creatures</strong>
              Hero characters, NPCs, stylized or realistic creatures for games and film.
            </li>
            <li>
              <strong>Environments &amp; props</strong>
              Sets, modular kits, hard-surface props, and scene dressing.
            </li>
            <li>
              <strong>Product &amp; visualization assets</strong>
              Clean product models and look-development assets for marketing or AR.
            </li>
            <li>
              <strong>Pipeline-adjacent assets</strong>
              Supporting meshes, LODs, and variants that fit your existing tools and plugins.
            </li>
          </ul>
        </section>

        <section className="marketing-section" aria-labelledby="why-portal">
          <h2 id="why-portal">Why use the project portal</h2>
          <p>
            Everything stays in one place: quotations, conversation history, reference files, and
            delivery packages. You do not need a separate payment or storage account to start —
            create a free customer account, submit a request, and we handle the rest through the
            portal.
          </p>
        </section>
      </div>
    </main>
  )
}
