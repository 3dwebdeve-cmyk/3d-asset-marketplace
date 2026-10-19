import { SITE_NAME } from './seo'

/**
 * Copy for public pages that are indexed by search engines. Pages import these
 * constants and the Cloudflare worker renders the same values into the HTML it serves,
 * so the first response a crawler sees matches what the page sets after it loads.
 */
export interface StaticPageSeo {
  title: string
  description: string
  keywords?: string[]
}

export const HOME_SEO: StaticPageSeo = {
  title: `${SITE_NAME} | Premium 3D Models, Plugins & Custom 3D Projects`,
  description:
    'Buy and download 3D models for Blender, Maya and more. Browse game-ready, animated and PBR 3D assets, software plugins and custom 3D production services.',
  keywords: [
    '3D models',
    '3D assets',
    'download 3D models',
    'game-ready 3D models',
    'Blender models',
    'Maya models',
    '3D plugins',
  ],
}

export const MODELS_SEO: StaticPageSeo = {
  title: `3D Models | ${SITE_NAME}`,
  description: `Browse and download 3D models for games, animation, architecture, furniture and 3D printing. Filter by software, format and license on ${SITE_NAME}.`,
  keywords: ['3D models', 'download 3D models', 'game 3D models', 'Blender models', 'Maya models'],
}

export const PLUGINS_SEO: StaticPageSeo = {
  title: `3D Plugins | ${SITE_NAME}`,
  description: `Professional plugins for Blender, Maya, Cinema 4D and more. Filter by software, format and license on ${SITE_NAME}.`,
  keywords: ['3D plugins', 'Blender plugins', 'Maya plugins', 'Cinema 4D plugins', '3D software add-ons'],
}

export const CATEGORIES_SEO: StaticPageSeo = {
  title: `All Categories | ${SITE_NAME}`,
  description: `Browse the full ${SITE_NAME} collection by category.`,
}

export const ABOUT_SEO: StaticPageSeo = {
  title: `About the Studio | ${SITE_NAME}`,
  description:
    'Learn about our studio, marketplace of premium 3D assets and plugins, and custom design services.',
}

export const CONTACT_SEO: StaticPageSeo = {
  title: `Enquiry | ${SITE_NAME}`,
  description:
    'Enquire about 3D models, plugins, custom work, bulk licensing, or technical support. We usually respond within 24 hours.',
}

export const CUSTOM_PROJECTS_SEO: StaticPageSeo = {
  title: `Custom Projects | ${SITE_NAME}`,
  description:
    'Request custom 3D design work by email enquiry — share your brief and our team will follow up from the company inbox.',
}

export const TERMS_SEO: StaticPageSeo = {
  title: `Terms of Service | ${SITE_NAME}`,
  description: `Terms of Service for buying 3D models, plugins, and custom project work on ${SITE_NAME}.`,
}

export const PRIVACY_SEO: StaticPageSeo = {
  title: `Privacy Policy | ${SITE_NAME}`,
  description: `How ${SITE_NAME} collects, uses, and protects account and order information.`,
}

/** Indexable public routes, keyed by pathname. Used for SSR head tags and the sitemap. */
export const STATIC_PAGE_SEO: Readonly<Record<string, StaticPageSeo>> = {
  '/': HOME_SEO,
  '/3d-models': MODELS_SEO,
  '/plugins': PLUGINS_SEO,
  '/categories': CATEGORIES_SEO,
  '/about': ABOUT_SEO,
  '/contact': CONTACT_SEO,
  '/custom-projects': CUSTOM_PROJECTS_SEO,
  '/terms': TERMS_SEO,
  '/privacy': PRIVACY_SEO,
}
