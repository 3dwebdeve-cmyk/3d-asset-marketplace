import { Link } from 'react-router-dom'

import { AuthEntryButton } from '../../components/auth/AuthEntryButton'
import {
  CUSTOM_PROJECTS_HERO_IMAGE_SRC,
  SiteHeroImage,
} from '../../components/SiteHeroImage'
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
    <main className="marketing-page custom-projects-page">
      <header
        className="custom-projects-hero site-hero-banner"
        aria-labelledby="custom-projects-title"
      >
        <SiteHeroImage src={CUSTOM_PROJECTS_HERO_IMAGE_SRC} width={4216} height={992} />
        <div className="custom-projects-hero__content">
          <h1 id="custom-projects-title">Custom 3D projects, from concept to delivery</h1>
          <p className="custom-projects-hero__lead">
            Need something that&apos;s not in the catalog? Tell us what you need, get a clear
            quotation, and work with our studio through a dedicated project portal — messaging,
            files, revisions, and final delivery.
          </p>
          <div className="marketing-actions custom-projects-hero__actions">
            {canRequest ? (
              <Link className="home-page__cta" to={REQUEST_PATH}>
                Start a project request <span aria-hidden="true">→</span>
              </Link>
            ) : isAdmin ? (
              <Link className="home-page__cta" to="/console/projects">
                Open admin projects <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <AuthEntryButton
                mode="login"
                returnTo={REQUEST_PATH}
                className="home-page__cta"
              >
                Sign in to request a project <span aria-hidden="true">→</span>
              </AuthEntryButton>
            )}
            {!isAuthenticated ? (
              <AuthEntryButton
                mode="register"
                returnTo={REQUEST_PATH}
                className="home-page__cta home-page__cta--secondary"
              >
                Create an account
              </AuthEntryButton>
            ) : null}
            <Link className="home-page__cta home-page__cta--secondary" to="/contact">
              Ask a question first
            </Link>
          </div>
        </div>
      </header>

      <div className="marketing-page__inner">
        <section
          className="marketing-section custom-projects-process"
          aria-labelledby="how-it-works"
        >
          <h2 id="how-it-works">How it works</h2>
          <p className="custom-projects-process__subtitle">
            Four clear and transparent stages designed to bring your 3D assets to life.
          </p>
          <ol className="custom-projects-process__steps">
            <li>
              <div className="custom-projects-process__meta">
                <span className="custom-projects-process__number">01</span>
                <span className="custom-projects-process__icon custom-projects-process__icon--file">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 3h7l4 4v14H7z" />
                    <path d="M14 3v5h5M12 11v6M9 14h6" />
                  </svg>
                </span>
              </div>
              <strong>Submit a request</strong>
              Share your title, description, budget range, and deadline from your dashboard.
            </li>
            <li>
              <div className="custom-projects-process__meta">
                <span className="custom-projects-process__number">02</span>
                <span className="custom-projects-process__icon custom-projects-process__icon--message">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 5h16v12H9l-5 4z" />
                    <path d="M8 10h.01M12 10h.01M16 10h.01" />
                  </svg>
                </span>
              </div>
              <strong>Review &amp; quote</strong>
              Our team reviews the brief and sends a quotation you can accept or discuss.
            </li>
            <li>
              <div className="custom-projects-process__meta">
                <span className="custom-projects-process__number">03</span>
                <span className="custom-projects-process__icon custom-projects-process__icon--production">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
                  </svg>
                </span>
              </div>
              <strong>Approve &amp; produce</strong>
              Once approved, work moves into production with messaging and file sharing.
            </li>
            <li>
              <div className="custom-projects-process__meta">
                <span className="custom-projects-process__number">04</span>
                <span className="custom-projects-process__icon custom-projects-process__icon--delivery">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
                    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
                  </svg>
                </span>
              </div>
              <strong>Delivery &amp; complete</strong>
              Receive deliverables through the portal and mark the project complete when ready.
            </li>
          </ol>
        </section>

        <section
          className="marketing-section custom-projects-request-types"
          aria-labelledby="what-you-can-request"
        >
          <h2 id="what-you-can-request">What you can request</h2>
          <p className="custom-projects-request-types__subtitle">
            Tailored production for game engines, animation studios, and real-time visualization.
          </p>
          <ul className="custom-projects-request-types__grid">
            <li>
              <span className="custom-projects-request-types__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="9" r="3" />
                  <path d="M7 19c.6-3 2.2-4.5 5-4.5s4.4 1.5 5 4.5M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" />
                </svg>
              </span>
              <div className="custom-projects-request-types__content">
                <div className="custom-projects-request-types__heading">
                  <strong>Characters &amp; creatures</strong>
                  <span aria-hidden="true">↗</span>
                </div>
                <p>Hero characters, NPCs, stylized or realistic creatures for games and film.</p>
                <div className="custom-projects-request-types__tags">
                  <span>Rigged</span>
                  <span>Game-Ready</span>
                  <span>PBR Textures</span>
                </div>
              </div>
            </li>
            <li>
              <span className="custom-projects-request-types__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 20h16M6 20V9l6-4v15M12 20v-8l6-3v11M8.5 11h1M8.5 14h1M8.5 17h1M15 13h1M15 16h1" />
                </svg>
              </span>
              <div className="custom-projects-request-types__content">
                <div className="custom-projects-request-types__heading">
                  <strong>Environments &amp; props</strong>
                  <span aria-hidden="true">↗</span>
                </div>
                <p>Sets, modular kits, hard-surface props, and scene dressing.</p>
                <div className="custom-projects-request-types__tags">
                  <span>Modular</span>
                  <span>Low/High Poly</span>
                  <span>Unreal/Unity</span>
                </div>
              </div>
            </li>
            <li>
              <span className="custom-projects-request-types__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="7" y="3" width="10" height="18" rx="2" />
                  <path d="M10 6h4M11 18h2" />
                </svg>
              </span>
              <div className="custom-projects-request-types__content">
                <div className="custom-projects-request-types__heading">
                  <strong>Product &amp; visualization assets</strong>
                  <span aria-hidden="true">↗</span>
                </div>
                <p>
                  Clean product models and look-development assets for marketing or AR.
                </p>
                <div className="custom-projects-request-types__tags">
                  <span>CAD Conversion</span>
                  <span>AR Ready</span>
                  <span>Photorealistic</span>
                </div>
              </div>
            </li>
            <li>
              <span className="custom-projects-request-types__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
                </svg>
              </span>
              <div className="custom-projects-request-types__content">
                <div className="custom-projects-request-types__heading">
                  <strong>Pipeline-adjacent assets</strong>
                  <span aria-hidden="true">↗</span>
                </div>
                <p>
                  Supporting meshes, LODs, and variants that fit your existing tools and plugins.
                </p>
                <div className="custom-projects-request-types__tags">
                  <span>LOD 0–4</span>
                  <span>Blender Addons</span>
                  <span>Custom Shaders</span>
                </div>
              </div>
            </li>
          </ul>
        </section>

        <section
          className="marketing-section custom-projects-portal"
          aria-labelledby="why-portal"
        >
          <div className="custom-projects-portal__inner">
            <div className="custom-projects-portal__content">
              <h2 id="why-portal">Why use the project portal</h2>
              <p>
                Everything stays in one place: quotations, conversation history, reference files,
                and delivery packages. You do not need a separate payment or storage account to
                start — create a free customer account, submit a request, and we handle the rest
                through the portal.
              </p>
            </div>
            {canRequest ? (
              <Link className="custom-projects-portal__cta" to="/dashboard/projects">
                Access Project Portal <span aria-hidden="true">→</span>
              </Link>
            ) : isAdmin ? (
              <Link className="custom-projects-portal__cta" to="/console/projects">
                Access Project Portal <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <AuthEntryButton
                mode="login"
                returnTo="/dashboard/projects"
                className="custom-projects-portal__cta"
              >
                Access Project Portal <span aria-hidden="true">→</span>
              </AuthEntryButton>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
