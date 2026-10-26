import { CUSTOM_PROJECTS_SEO } from '../../lib/seoPages'
import { buildCustomProjectsJsonLd } from '../../lib/customProjectSeo'
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
    ...CUSTOM_PROJECTS_SEO,
    canonicalPath: '/custom-projects',
    structuredData: buildCustomProjectsJsonLd(),
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
      </div>
    </main>
  )
}
