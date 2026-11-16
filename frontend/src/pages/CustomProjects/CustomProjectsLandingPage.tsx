import { CUSTOM_PROJECTS_SEO } from '../../lib/seoPages'
import { buildCustomProjectsJsonLd } from '../../lib/customProjectSeo'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import markup from './custom-studio.html?raw'
import './custom-studio.css'
import { BriefServiceSelector } from './BriefServiceSelector'

const [intro, remaining] = markup.split('<div class="studio-information">')

export function CustomProjectsLandingPage() {
  useDocumentSeo({ ...CUSTOM_PROJECTS_SEO, canonicalPath: '/custom-projects', structuredData: buildCustomProjectsJsonLd() })
  return <main className="custom-studio"><div dangerouslySetInnerHTML={{ __html: intro }} /><BriefServiceSelector /><div dangerouslySetInnerHTML={{ __html: '<div class="studio-information">' + remaining }} /></main>
}
