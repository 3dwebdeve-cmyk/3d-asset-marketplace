import { useEffect, useRef } from 'react'
import { CUSTOM_PROJECTS_SEO } from '../../lib/seoPages'
import { buildCustomProjectsJsonLd } from '../../lib/customProjectSeo'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { initializeStudioEnquiry } from './studioEnquiry'
import markup from './custom-studio.html?raw'
import './custom-studio.css'

export function CustomProjectsLandingPage() {
  const root = useRef<HTMLElement>(null)
  useDocumentSeo({ ...CUSTOM_PROJECTS_SEO, canonicalPath: '/custom-projects', structuredData: buildCustomProjectsJsonLd() })
  useEffect(() => {
    if (root.current) return initializeStudioEnquiry(root.current)
  }, [])
  return <main ref={root} className="custom-studio" dangerouslySetInnerHTML={{ __html: markup }} />
}
