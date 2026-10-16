import { Link } from 'react-router-dom'

import {
  CUSTOM_PROJECTS_HERO_IMAGE_SRC,
  SiteHeroImage,
} from '../../components/SiteHeroImage'
import { CustomProjectServices } from './CustomProjectServices'
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
        <CustomProjectServices />

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
