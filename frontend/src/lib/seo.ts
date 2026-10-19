import type { PublicProduct } from '../types/product'

export const SITE_NAME = 'AssetHive 3D'

/** Social preview image used on pages that do not provide their own. */
export const DEFAULT_SOCIAL_IMAGE = '/banner image/01.jpg'

type PriceFields = Pick<PublicProduct, 'price' | 'currency' | 'discount_price'>
type RatingFields = Pick<PublicProduct, 'average_rating' | 'review_count'>

function buildOffer({ price, currency, discount_price }: PriceFields) {
  return {
    '@type': 'Offer',
    price: discount_price ?? price,
    priceCurrency: currency,
    availability: 'https://schema.org/InStock',
  }
}

function buildAggregateRating({ average_rating, review_count }: RatingFields) {
  const ratingValue = Number(average_rating)
  if (review_count <= 0 || !Number.isFinite(ratingValue) || ratingValue <= 0) {
    return undefined
  }
  return {
    '@type': 'AggregateRating',
    ratingValue,
    reviewCount: review_count,
  }
}

export interface ProductSeoInput extends PriceFields, RatingFields {
  id: string
  name: string
  short_description: string
  thumbnail: string
  category?: { name: string } | null
  software_used?: string
}

/** schema.org Product data for a 3D model listing. */
export function buildProductStructuredData(product: ProductSeoInput) {
  return {
    '@type': 'Product',
    name: product.name,
    description: product.short_description || product.name,
    image: product.thumbnail || undefined,
    sku: product.id,
    category: product.category?.name,
    brand: { '@type': 'Brand', name: SITE_NAME },
    offers: buildOffer(product),
    aggregateRating: buildAggregateRating(product),
  }
}

export interface PluginSeoInput extends PriceFields, RatingFields {
  name: string
  short_description: string
  thumbnail: string
  version: string
}

/** schema.org SoftwareApplication data for a software plugin listing. */
export function buildPluginStructuredData(plugin: PluginSeoInput) {
  return {
    '@type': 'SoftwareApplication',
    name: plugin.name,
    description: plugin.short_description || plugin.name,
    image: plugin.thumbnail || undefined,
    applicationCategory: 'DesignApplication',
    softwareVersion: plugin.version || undefined,
    offers: buildOffer(plugin),
    aggregateRating: buildAggregateRating(plugin),
  }
}

export function buildProductPageTitle(productName: string): string {
  return `${productName} | 3D Model | ${SITE_NAME}`
}

export function buildProductMetaDescription(
  productName: string,
  shortDescription: string,
): string {
  const trimmed = shortDescription.trim()
  if (trimmed) {
    return trimmed.slice(0, 160)
  }
  return `View details and download the ${productName} 3D model on ${SITE_NAME}.`
}

export function buildPluginPageTitle(pluginName: string): string {
  return `${pluginName} | 3D Plugin | ${SITE_NAME}`
}

export function buildPluginMetaDescription(pluginName: string, shortDescription: string): string {
  const trimmed = shortDescription.trim()
  if (trimmed) {
    return trimmed.slice(0, 160)
  }
  return `View details for ${pluginName} on ${SITE_NAME}.`
}

/** schema.org CollectionPage data for a catalog or category listing. */
export function buildCollectionStructuredData(name: string, description: string) {
  return {
    '@type': 'CollectionPage',
    name,
    description,
  }
}
