import { HOME_TITLE, HOME_DESCRIPTION, SITE_NAME, buildPageTitle } from './seo'
import { ALL_MODELS_SEO } from './categorySeo'

/**
 * Copy for public pages that are indexed by search engines. Pages import these
 * constants and the Cloudflare worker renders the same values into the HTML it serves,
 * so the first response a crawler sees matches what the page sets after it loads.
 */
export interface StaticPageSeo {
  title: string
  description: string
  keywords?: string[]
  image?: string
  imageAlt?: string
}

export const HOME_SEO: StaticPageSeo = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
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
  title: buildPageTitle(ALL_MODELS_SEO.title),
  description: ALL_MODELS_SEO.description,
  keywords: ['3D models', 'download 3D models', 'game 3D models', 'Blender models', 'Maya models'],
}

export const PLUGINS_SEO: StaticPageSeo = {
  title: buildPageTitle('Blender & Unreal Plugins and Tools'),
  description: 'Browse plugins and tools for Blender and Unreal to speed up your 3D workflow. Secure checkout and instant download after purchase.',
  keywords: ['3D plugins', 'Blender plugins', 'Maya plugins', 'Cinema 4D plugins', '3D software add-ons'],
}

export const CATEGORIES_SEO: StaticPageSeo = {
  title: buildPageTitle('3D Model Categories: Furniture, Interior & More'),
  description: 'Browse 3D model categories: furniture, interior, household, lighting, plants, products and more. Preview in 3D, secure checkout and instant download after purchase.',
}

export const ABOUT_SEO: StaticPageSeo = {
  title: `About the Studio | ${SITE_NAME}`,
  description:
    'About AssetHive3D: a marketplace for furniture and interior 3D models and Blender and Unreal plugins, plus custom 3D modeling, texturing and rendering.',
}

export const CONTACT_SEO: StaticPageSeo = {
  title: `Contact & Enquiries | ${SITE_NAME}`,
  description:
    'Enquire about 3D models, plugins, custom work, bulk licensing, or technical support. We usually respond within 24 hours.',
}

export const CUSTOM_PROJECTS_SEO: StaticPageSeo = {
  title: `Custom 3D Modeling, Rendering & Animation | ${SITE_NAME}`,
  description:
    'Request custom 3D modeling, product renders, animation, packaging design and furniture visualization. Select your services and send a project enquiry.',
  keywords: [
    'custom 3D modeling', '3D rendering services', 'product visualization',
    '3D product animation', 'furniture visualization', '3D packaging design',
    'lifestyle renders', 'marketplace product images',
  ],
  image: '/images/CUSTOM%20PROJECTS.webp',
  imageAlt: 'Custom 3D project services from AssetHive3D',
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
