import { CUSTOM_PROJECTS_SEO } from '../../lib/seoPages'
import { buildCustomProjectsJsonLd } from '../../lib/customProjectSeo'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import markup from './custom-studio.html?raw'
import './custom-studio.css'

export function CustomProjectsLandingPage() {
  useDocumentSeo({ ...CUSTOM_PROJECTS_SEO, canonicalPath: '/custom-projects', structuredData: buildCustomProjectsJsonLd() })
  return <main className="custom-studio" dangerouslySetInnerHTML={{ __html: markup }} />
}
