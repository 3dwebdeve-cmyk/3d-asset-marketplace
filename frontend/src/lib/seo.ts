import type { PublicProductDetail } from '../types/product'

/** One spelling of the brand everywhere search engines read it. */
export const SITE_NAME = 'AssetHive3D'
export const SITE_TAGLINE = 'Furniture & Interior 3D Models'
export const DEFAULT_OG_IMAGE_PATH = '/og-default.jpg'
export const LOGO_PATH = '/images/AssetHive%203D.svg'

export const HOME_TITLE = `${SITE_TAGLINE} | ${SITE_NAME}`
export const HOME_DESCRIPTION =
  'Download production-ready 3D models of furniture, interiors, lighting and plants. ' +
  'Preview every model in 3D, buy securely and get a license with each order.'

const TITLE_LIMIT = 60
const DESCRIPTION_LIMIT = 160

/**
 * The public address of the site, without a trailing slash. Set VITE_SITE_URL at build time
 * (for example https://assethive3d.com) so canonical links and social cards use the real
 * domain; falls back to the address the page is served from.
 */
export function getSiteUrl(): string {
  const configured = String(import.meta.env.VITE_SITE_URL ?? '').trim()
  const base = configured || (typeof window !== 'undefined' ? window.location.origin : '')
  return base.replace(/\/+$/, '')
}

export function absoluteUrl(pathOrUrl: string): string {
  const value = pathOrUrl.trim()
  if (/^https?:\/\//i.test(value)) return value
  return `${getSiteUrl()}${value.startsWith('/') ? value : `/${value}`}`
}

/** Collapse whitespace and cut at a word boundary so a snippet never ends mid-word. */
export function truncateText(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= limit) return clean
  const cut = clean.slice(0, limit - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, '')}…`
}

/** Remove markup a description might carry, so structured data stays plain text. */
export function plainText(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function buildPageTitle(pageTitle: string): string {
  const suffix = ` | ${SITE_NAME}`
  return `${truncateText(pageTitle, TITLE_LIMIT + 6 - suffix.length)}${suffix}`
}

export function buildProductTitle(name: string, categoryName?: string): string {
  const withCategory = categoryName ? `${name} – ${categoryName} 3D Model | ${SITE_NAME}` : ''
  if (withCategory && withCategory.length <= TITLE_LIMIT + 6) return withCategory
  return `${truncateText(name, TITLE_LIMIT - SITE_NAME.length - 12)} 3D Model | ${SITE_NAME}`
}

export interface ProductDescriptionExtras {
  categoryName?: string
  polygonCount?: number | null
  licenseType?: string
}

/**
 * Meta description for a product. A hand-written short description wins; otherwise one is
 * assembled only from facts the product actually has, never from guesses.
 */
export function buildProductDescription(
  name: string,
  shortDescription: string,
  extras: ProductDescriptionExtras = {},
): string {
  const written = plainText(shortDescription)
  if (written) return truncateText(written, DESCRIPTION_LIMIT)
  const facts = [
    extras.categoryName ? `${extras.categoryName} 3D model` : '3D model',
    extras.polygonCount ? `${extras.polygonCount.toLocaleString('en-US')} polygons` : '',
  ].filter(Boolean)
  const license = extras.licenseType ? ` ${capitalize(extras.licenseType)} license.` : ''
  return truncateText(
    `${name}: ${facts.join(', ')}. Preview in 3D, secure checkout and instant download.${license}`,
    DESCRIPTION_LIMIT,
  )
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export interface BreadcrumbItem {
  name: string
  path: string
}

export function buildBreadcrumbJsonLd(items: readonly BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export function buildOrganizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: getSiteUrl(),
    logo: absoluteUrl(LOGO_PATH),
  }
}

export function buildWebSiteJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: getSiteUrl(),
  }
}

export function buildItemListJsonLd(
  name: string,
  items: readonly { name: string; path: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(item.path),
      name: item.name,
    })),
  }
}

/**
 * schema.org Product with an Offer, so a result can show the price. Only real values go in:
 * ratings appear only when there are reviews, and nothing is added that the page does not show.
 */
export function buildProductJsonLd(product: PublicProductDetail, path: string): Record<string, unknown> {
  const url = absoluteUrl(path)
  const images = [product.thumbnail, ...product.images.map((image) => image.image_url)]
    .filter(Boolean)
    .map(absoluteUrl)
  const price = Number(product.discount_price ?? product.price)
  const rating = Number(product.average_rating)
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: truncateText(plainText(product.short_description || product.description || product.name), 500),
    url,
    category: product.category.name,
    brand: { '@type': 'Brand', name: SITE_NAME },
  }
  if (images.length > 0) data.image = [...new Set(images)]
  if (Number.isFinite(price) && price >= 0) {
    data.offers = {
      '@type': 'Offer',
      url,
      priceCurrency: product.currency,
      price: price.toFixed(2),
      availability: 'https://schema.org/InStock',
    }
  }
  if (product.review_count > 0 && Number.isFinite(rating) && rating > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rating,
      reviewCount: product.review_count,
    }
  }
  return data
}
