import { MODEL_PAGE_SIZE, catalogPagePath, hasCatalogFilters, readCatalogPage } from '../src/lib/modelCatalogSeo'
import { SLUG_PATTERN, getNotFoundPageSeo, type ModelSummary, type PageSeo } from './seo'

export function modelSummaries(body: unknown): ModelSummary[] {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { results?: unknown }).results)) return []
  return (body as { results: unknown[] }).results.filter((item): item is ModelSummary => {
    if (!item || typeof item !== 'object') return false
    const model = item as ModelSummary
    return typeof model.name === 'string' && typeof model.slug === 'string' && SLUG_PATTERN.test(model.slug)
  }).map((model) => ({
    name: model.name, slug: model.slug,
    thumbnail: typeof model.thumbnail === 'string' ? model.thumbnail : undefined,
    short_description: typeof model.short_description === 'string' ? model.short_description : undefined,
  }))
}

export function catalogApiUrl(backend: URL, params: URLSearchParams, categoryId?: string): URL {
  const url = new URL('/api/v1/products/', backend)
  url.searchParams.set('ordering', '-created_at')
  url.searchParams.set('page_size', String(MODEL_PAGE_SIZE))
  url.searchParams.set('page', String(readCatalogPage(params)))
  if (categoryId) url.searchParams.set('category_id', categoryId)
  return url
}

export function applyCatalogSeo(seo: PageSeo, body: unknown, path: string, params: URLSearchParams, origin: string): PageSeo {
  const page = readCatalogPage(params)
  const filtered = hasCatalogFilters(params)
  const canonicalPath = filtered ? path : catalogPagePath(path, page)
  // Filtered views use the client-side facets. Do not describe a different selection in initial HTML.
  if (filtered) return { ...seo, canonicalPath, robots: 'noindex, follow' }
  const listing = body as { results?: unknown[]; next?: unknown; count?: number } | null
  if (!listing || !Array.isArray(listing.results)) return { ...seo, canonicalPath }
  if (page > 1 && listing.results.length === 0) return getNotFoundPageSeo('Page')
  const models = modelSummaries(body)
  const graph = seo.structuredData?.['@graph'] as object[] | undefined
  return {
    ...seo, canonicalPath, models,
    title: page > 1 ? `${seo.heading ?? seo.title.split(' | ')[0]} - Page ${page} | AssetHive3D` : seo.title,
    robots: !listing.results.length ? 'noindex, follow' : seo.robots,
    pagination: {
      current: page,
      previous: page > 1 ? catalogPagePath(path, page - 1) : undefined,
      next: listing.next ? catalogPagePath(path, page + 1) : undefined,
    },
    structuredData: {
      '@graph': [
        ...(graph ?? (seo.structuredData ? [seo.structuredData] : [])),
        ...(models.length ? [{
          '@type': 'ItemList', name: seo.heading ?? seo.title,
          itemListElement: models.map((model, index) => ({
            '@type': 'ListItem', position: (page - 1) * MODEL_PAGE_SIZE + index + 1,
            name: model.name, url: `${origin}/products/${encodeURIComponent(model.slug)}`,
          })),
        }] : []),
      ],
    },
  }
}
