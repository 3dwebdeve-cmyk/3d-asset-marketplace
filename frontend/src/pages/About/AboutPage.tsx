import { Link } from 'react-router-dom'

import { ABOUT_HERO_IMAGE_SRC, SiteHeroImage } from '../../components/SiteHeroImage'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import '../../styles/about.css'
import '../../styles/marketing.css'

// Only things the shop really does. Do not put counts here (assets, creators, countries) unless
// they are real and can be shown.
const HERO_STATS = [
  { value: '3D', label: 'Preview in your browser' },
  { value: '1', label: 'License certificate per order' },
  { value: 'Instant', label: 'Download once your order is paid' },
] as const

const WHO_CARDS = [
  {
    title: '3D Assets',
    text: 'Production-ready models with clear specs, previews, and licensing.',
    icon: 'cube' as const,
  },
  {
    title: 'Creators and Studios',
    text: 'For interior visualization, games, film, product, and AR work.',
    icon: 'people' as const,
  },
  {
    title: 'Endless Possibilities',
    text: 'From off-the-shelf downloads to fully custom briefs under one roof.',
    icon: 'bulb' as const,
  },
]

const MISSION_POINTS = [
  { title: 'Quality First', text: 'Carefully reviewed assets', icon: 'diamond' as const },
  { title: 'Creator Focused', text: 'Built for people who make things in 3D', icon: 'people' as const },
  { title: 'Transparent', text: 'Clear process and communication', icon: 'shield' as const },
  { title: 'Always Improving', text: 'More models, more possibilities', icon: 'globe' as const },
]

const OFFER_CARDS = [
  {
    title: '3D model marketplace',
    text: 'Browse and purchase high-quality models with clear specs, previews, and secure downloads.',
    to: '/3d-models',
    image: '/images/about/offer-3d-models.jpg?v=1',
    imagePosition: 'center',
    badge: 'cube' as const,
    badgeTone: 'blue' as const,
  },
  {
    title: 'Plugin store',
    text: 'Discover plugins and tools that fit your pipeline, with compatible software called out clearly.',
    to: '/plugins',
    image: '/images/about/offer-plugins.jpg?v=1',
    imagePosition: 'center',
    badge: 'puzzle' as const,
    badgeTone: 'green' as const,
  },
  {
    title: 'Custom projects',
    text: 'Share a brief by email, receive a quotation, and collaborate with our studio through delivery.',
    to: '/contact?enquiryType=Custom%203D%20Modeling',
    image: '/images/about/offer-custom-projects.jpg?v=1',
    imagePosition: 'center',
    badge: 'doc' as const,
    badgeTone: 'orange' as const,
  },
]

const TRUST_STEPS = [
  { title: '1. Review', text: 'Quality checked by our team', icon: 'search' as const },
  { title: '2. Purchase', text: 'Secure and simple', icon: 'cart' as const },
  { title: '3. Track', text: 'Stay updated in your dashboard', icon: 'file' as const },
  { title: '4. Get Results', text: 'Use with confidence', icon: 'check' as const },
]

function Icon({ name }: { name: string }) {
  switch (name) {
    case 'cube':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
        </svg>
      )
    case 'people':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="8" r="3" />
          <circle cx="16.5" cy="9" r="2.4" />
          <path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" />
          <path d="M14 19c.5-2.2 1.9-3.5 3.8-3.5 1.4 0 2.6.7 3.2 2" />
        </svg>
      )
    case 'bulb':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 18h6M10 21h4" />
          <path d="M12 3a6 6 0 0 1 4.2 10.1c-.8.8-1.2 1.7-1.2 2.9h-6c0-1.2-.4-2.1-1.2-2.9A6 6 0 0 1 12 3Z" />
        </svg>
      )
    case 'diamond':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 3 8 7-8 11L4 10l8-7Z" />
          <path d="M4 10h16M9.5 3.8 12 10l2.5-6.2" />
        </svg>
      )
    case 'user':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 20c1-3.6 3.4-5.5 7-5.5s6 1.9 7 5.5" />
        </svg>
      )
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 19 6v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      )
    case 'globe':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5S14.4 18.1 12 20.5C9.6 18.1 8.4 15.3 8.4 12S9.6 5.9 12 3.5Z" />
        </svg>
      )
    case 'puzzle':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 4h4v3a2 2 0 1 0 0 4v3h-3a2 2 0 1 0-4 0H4V4h3a2 2 0 1 0 3 0V4Z" />
          <path d="M14 14h6v6h-3a2 2 0 1 1-4 0h-2v-3a2 2 0 1 1 0-4h3v1Z" />
        </svg>
      )
    case 'doc':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 3h7l4 4v14H7V3Z" />
          <path d="M14 3v5h5M9 12h6M9 16h6" />
        </svg>
      )
    case 'search':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      )
    case 'cart':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 5h2l2.2 10h10.3L20 8H7.2" />
          <circle cx="10" cy="19" r="1.4" />
          <circle cx="16.5" cy="19" r="1.4" />
        </svg>
      )
    case 'file':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 3h7l4 4v14H7V3Z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
      )
    case 'check':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8.5 12.2 2.4 2.4 4.6-4.8" />
        </svg>
      )
    case 'arrow-down':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v12M7 13l5 5 5-5" />
        </svg>
      )
    case 'download':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v10M8 10l4 4 4-4M5 18h14" />
        </svg>
      )
    default:
      return null
  }
}

export function AboutPage() {
  useDocumentSeo({
    title: 'About the Studio | AssetHive3D',
    description:
      'About AssetHive3D: a marketplace for furniture and interior 3D models and Blender and Unreal plugins, plus custom 3D modeling, texturing and rendering.',
    canonicalPath: '/about',
  })

  return (
    <main className="about-page">
      <section className="about-hero site-hero-banner" aria-labelledby="about-title">
        <SiteHeroImage src={ABOUT_HERO_IMAGE_SRC} width={2804} height={561} />
        <div className="about-hero__content">
          <div className="about-hero__copy">
            <h1 id="about-title">3D models, plugins and custom 3D design in one place</h1>
            <p className="about-hero__lead">
              We build and curate marketplace-ready 3D models and plugins, and we partner with
              creators who need bespoke design work — from brief to delivery by email enquiry.
            </p>
            <dl className="about-hero__stats">
              {HERO_STATS.map((stat) => (
                <div key={stat.label} className="about-hero__stat">
                  <dt>{stat.value}</dt>
                  <dd>{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="about-who" aria-labelledby="about-who-title">
        <div className="about-section-shell about-who__grid">
          <div className="about-who__copy">
            <p className="about-eyebrow about-eyebrow--accent">Who we are</p>
            <h2 id="about-who-title">
              One Place for Everything <span>3D</span>
            </h2>
            <p>
              3D Hub is a marketplace and studio built for people who ship real work — games, film,
              product visualization, architecture, and interactive experiences.
            </p>
            <p>
              We combine a curated catalog of models and plugins with custom project enquiries by
              email, so teams can buy what they need today and commission what they cannot find.
            </p>
            <p>
              Every asset and every project is handled with clear specs, transparent status, and a
              focus on production readiness — not just pretty renders.
            </p>
          </div>

          <div className="about-who__cards">
            {WHO_CARDS.map((card) => (
              <article key={card.title} className="about-who-card">
                <span className="about-who-card__icon" aria-hidden="true">
                  <Icon name={card.icon} />
                </span>
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="about-mission" aria-labelledby="about-mission-title">
        <div className="about-mission__glow" aria-hidden="true" />
        <div className="about-section-shell about-mission__grid">
          <div className="about-mission__copy">
            <p className="about-eyebrow about-eyebrow--accent">Our mission</p>
            <h2 id="about-mission-title">Empowering creators with quality and trust</h2>
            <p>
              Creators deserve production-quality assets without guessing about licensing, file
              readiness, or support. Our marketplace focuses on carefully curated models and
              plugins, while our custom project service lets you request original work by email
              when off-the-shelf assets are not enough.
            </p>
            <ul className="about-mission__points">
              {MISSION_POINTS.map((point) => (
                <li key={point.title}>
                  <span className="about-mission__icon" aria-hidden="true">
                    <Icon name={point.icon} />
                  </span>
                  <div>
                    <strong>{point.title}</strong>
                    <span>{point.text}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="about-mission__tagline">
            A global
            <br />
            community
            <br />
            for a brighter
            <br />
            tomorrow
          </p>
        </div>
      </section>

      <section className="about-offer" aria-labelledby="about-offer-title">
        <div className="about-section-shell">
          <div className="about-offer__header">
            <h2 id="about-offer-title">What we offer</h2>
            <p>Simple tools. Bigger ideas.</p>
          </div>
          <div className="about-offer__grid">
            {OFFER_CARDS.map((card) => (
              <article key={card.title} className="about-offer-card">
                <div className="about-offer-card__media">
                  <img
                    src={card.image}
                    alt=""
                    style={{ objectPosition: card.imagePosition }}
                    loading="lazy"
                  />
                  <span
                    className={`about-offer-card__badge about-offer-card__badge--${card.badgeTone}`}
                    aria-hidden="true"
                  >
                    <Icon name={card.badge} />
                  </span>
                </div>
                <div className="about-offer-card__body">
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                  <Link className="about-offer-card__link" to={card.to} aria-label={`Open ${card.title}`}>
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="about-trust" aria-labelledby="about-trust-title">
        <div className="about-section-shell about-trust__grid">
          <div className="about-trust__visual">
            <img
              src="/images/about/about-trust-visual.webp"
              alt=""
              width={1600}
              height={1200}
            />
          </div>
          <div className="about-trust__copy">
            <p className="about-eyebrow">How we earn trust</p>
            <h2 id="about-trust-title">A Clear and Reliable Process</h2>
            <p>
              Assets go through quality review before they appear in the catalog. Downloads are
              purchase-gated and audited. Custom work starts with an email enquiry — we quote
              scope, share files, and keep you updated through delivery.
            </p>
            <ul className="about-trust__steps">
              {TRUST_STEPS.map((step) => (
                <li key={step.title}>
                  <span className="about-trust__step-icon" aria-hidden="true">
                    <Icon name={step.icon} />
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <span>{step.text}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="about-cta" aria-labelledby="about-cta-title">
        <div className="about-section-shell">
          <div className="about-cta__card about-cta__inner">
            <div>
              <p className="about-eyebrow about-eyebrow--accent">Next steps</p>
              <h2 id="about-cta-title">Let&apos;s Create Something Great</h2>
              <p>
                Explore our library, try our tools, or tell us about your project. We&apos;d love to
                hear from you.
              </p>
            </div>
            <div className="about-cta__actions">
              <Link className="about-cta__btn about-cta__btn--primary" to="/3d-models">
                Browse Models
              </Link>
              <Link
                className="about-cta__btn about-cta__btn--ghost"
                to="/contact?enquiryType=Custom%203D%20Modeling"
              >
                Custom Projects
              </Link>
              <Link className="about-cta__btn about-cta__btn--ghost" to="/contact">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
