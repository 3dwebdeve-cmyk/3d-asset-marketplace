import { Link } from 'react-router-dom'

import {
  CUSTOM_PROJECTS_HERO_IMAGE_SRC,
  SiteHeroImage,
} from '../../components/SiteHeroImage'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import '../../styles/marketing.css'

const CONTACT_ENQUIRY_PATH =
  '/contact?enquiryType=' + encodeURIComponent('Custom 3D Modeling')

export function CustomProjectsLandingPage() {
  useDocumentSeo({
    title: 'Custom Projects | 3D Asset Marketplace',
    description:
      'Request custom 3D design work by email enquiry — share your brief and our team will follow up from the company inbox.',
  })

  return (
    <main className="marketing-page custom-projects-page">
      <header
        className="custom-projects-hero site-hero-banner"
        aria-labelledby="custom-projects-title"
      >
        <SiteHeroImage src={CUSTOM_PROJECTS_HERO_IMAGE_SRC} width={2804} height={561} />
        <div className="custom-projects-hero__content">
          <h1 id="custom-projects-title">Custom 3D projects, from concept to delivery</h1>
          <div className="marketing-actions custom-projects-hero__actions">
            <Link className="home-page__cta" to={CONTACT_ENQUIRY_PATH}>
              Send a project enquiry <span aria-hidden="true">→</span>
            </Link>
            <Link className="home-page__cta home-page__cta--secondary" to="/contact">
              Contact us
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
            Four clear stages — managed with you over email.
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
              <strong>Send an enquiry</strong>
              Share your title, description, budget range, and deadline via the contact form.
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
              Our team reviews the brief and replies by email with a quotation you can accept or
              discuss.
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
              Once approved, work moves into production with updates shared by email.
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
              Receive deliverables through arrangements agreed over email with our managers.
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
          aria-labelledby="why-email"
        >
          <div className="custom-projects-portal__inner">
            <div className="custom-projects-portal__content">
              <h2 id="why-email">Managed by email</h2>
              <p>
                Enquiries go straight to our company inbox. Managers handle quotations, files,
                and delivery offline — start with a free contact form submission and we will
                follow up from there.
              </p>
              <div className="marketing-actions" style={{ marginTop: '1.25rem' }}>
                <Link className="home-page__cta" to={CONTACT_ENQUIRY_PATH}>
                  Send a project enquiry <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
