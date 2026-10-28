import { CUSTOM_PROJECT_SERVICES } from './customProjectServices'
import { CUSTOM_PROJECTS_SEO } from './seoPages'
import { absoluteUrl, getSiteUrl, SITE_NAME } from './seo'

/** Describe only the services shown in the enquiry page, without invented prices or ratings. */
export function buildCustomProjectsJsonLd(origin = getSiteUrl()): Record<string, unknown> {
  const url = absoluteUrl('/custom-projects', origin)
  const providerId = `${origin}/#organization`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': providerId, name: SITE_NAME, url: `${origin}/` },
      {
        '@type': 'WebPage', '@id': url, url,
        name: CUSTOM_PROJECTS_SEO.title,
        description: CUSTOM_PROJECTS_SEO.description,
        inLanguage: 'en',
        mainEntity: { '@id': `${url}#service` },
        breadcrumb: { '@id': `${url}#breadcrumbs` },
      },
      {
        '@type': 'BreadcrumbList', '@id': `${url}#breadcrumbs`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Custom Projects', item: url },
        ],
      },
      {
        '@type': 'Service', '@id': `${url}#service`, url,
        name: 'Custom 3D Modeling, Rendering & Animation',
        description: CUSTOM_PROJECTS_SEO.description,
        provider: { '@id': providerId },
        hasOfferCatalog: {
          '@type': 'OfferCatalog', name: 'Custom 3D project services',
          itemListElement: CUSTOM_PROJECT_SERVICES.map((service) => ({
            '@type': 'Offer',
            itemOffered: { '@type': 'Service', name: service.title, description: service.description },
          })),
        },
      },
    ],
  }
}
