import {
  appendSitemapLine,
  getNotFoundPageSeo,
  getPluginPageSeo,
  getProductPageSeo,
  getStaticPageSeo,
  isLikelyAssetPath,
  normalizePath,
  renderSeoHead,
  escapeHtml,
  SLUG_PATTERN,
  type PageSeo,
} from './seo'
import type { PublicPluginDetail } from '../src/types/plugin'
import type { PublicProductDetail } from '../src/types/product'
import { buildCategoryTitle, categoryPath, getCategorySeo } from '../src/lib/categorySeo'
import {
  conditionalResponse,
  edgeCache,
  fromStoredCopy,
  isEdgeCacheable,
  sharedMaxAge,
  toStoredCopy,
} from './edgeCache'
import { isKnownAppPath } from './routes'

interface AssetsBinding {
  fetch(request: Request): Promise<Response>
}

export interface WorkerEnv {
  ASSETS: AssetsBinding
  BACKEND_ORIGIN?: string
  /** Public origin for canonical URLs and the sitemap, e.g. https://example.com. Defaults to the request origin. */
  SITE_URL?: string
  // Shared with the backend (EDGE_SHARED_SECRET). Set it as a Worker secret, not a plain variable.
  EDGE_SHARED_SECRET?: string
}

type CatalogKind = 'products' | 'plugins'

/** The parts of the Workers ExecutionContext the Worker uses. */
export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void
}

// Product and plugin detail routes, e.g. /products/desk-lamp or /Plugins/uv-tools.
const DETAIL_ROUTE = /^\/(products|plugins)\/([^/]+)$/i
const DETAIL_TIMEOUT_MS = 4000
const CATALOG_CACHE_TTL_SECONDS = 300

// Same security headers nginx sends for the SPA (frontend/nginx.conf). The Worker
// serves static assets directly, so without these the Cloudflare deploy has no CSP.
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; font-src 'self' data:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' blob: https://accounts.google.com https://*.googleapis.com https://*.sentry.io https://*.ingest.sentry.io https://pub-a20fb6d206fc47a1b1e5e247e82838e0.r2.dev https://0d3f756f61c3239ec77f9941c82c20c3.r2.cloudflarestorage.com; worker-src 'self' blob:; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; report-uri /api/v1/security/csp-report/",
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const isApiPath = (pathname: string): boolean =>
  pathname === '/api' || pathname.startsWith('/api/')

// The sitemap is built from the database by the backend; search engines ask for it at the site root.
const SITEMAP_PATH = '/sitemap.xml'
const UPSTREAM_SITEMAP_PATH = '/api/v1/sitemap.xml'

/**
 * robots.txt comes from the static file, plus a Sitemap line that uses whatever address the
 * visitor used. That keeps it correct on the current address and on the real domain later.
 */
async function robotsTxt(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errorResponse(405, 'Method not allowed.')
  }
  const asset = await env.ASSETS.fetch(request)
  const rules = asset.ok ? (await asset.text()).trimEnd() : 'User-agent: *\nAllow: /'
  return new Response(appendSitemapLine(rules, resolveSiteOrigin(env, url)), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

function backendOrigin(value: string | undefined): URL {
  if (!value) {
    throw new Error('BACKEND_ORIGIN is not configured')
  }

  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('BACKEND_ORIGIN must be an HTTPS origin without a path')
  }

  return url
}

function errorResponse(status: number, detail: string): Response {
  return Response.json(
    { detail },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

function resolveSiteOrigin(env: WorkerEnv, requestUrl: URL): string {
  const configured = env.SITE_URL?.trim()
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      // A malformed SITE_URL should not break the site; fall back to the request origin.
    }
  }
  return requestUrl.origin
}

function optionalBackendOrigin(value: string | undefined): URL | undefined {
  try {
    return backendOrigin(value)
  } catch {
    return undefined
  }
}

type CatalogFetchResult =
  | { kind: 'ok'; body: unknown }
  | { kind: 'missing' }
  | { kind: 'unavailable' }

/** Reads a public catalog endpoint. Failures are reported, never thrown, so pages still render. */
async function fetchCatalogJson(url: URL, env: WorkerEnv): Promise<CatalogFetchResult> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  // With EDGE_REQUIRE on, the backend refuses calls that do not carry the shared secret.
  if (env.EDGE_SHARED_SECRET) {
    headers['X-Edge-Secret'] = env.EDGE_SHARED_SECRET
  }
  let response: Response
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
      cf: { cacheTtl: CATALOG_CACHE_TTL_SECONDS, cacheEverything: true },
    } as RequestInit)
  } catch {
    return { kind: 'unavailable' }
  }

  if (response.status === 404) {
    return { kind: 'missing' }
  }
  if (!response.ok) {
    return { kind: 'unavailable' }
  }

  try {
    return { kind: 'ok', body: await response.json() }
  } catch {
    return { kind: 'unavailable' }
  }
}

function hasCatalogShape(body: unknown): body is PublicProductDetail | PublicPluginDetail {
  if (typeof body !== 'object' || body === null) {
    return false
  }
  const candidate = body as { name?: unknown; category?: unknown }
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.category === 'object' &&
    candidate.category !== null
  )
}

async function resolveDetailSeo(
  kind: CatalogKind,
  slug: string,
  env: WorkerEnv,
  siteOrigin: string,
): Promise<PageSeo | undefined> {
  const backend = optionalBackendOrigin(env.BACKEND_ORIGIN)
  if (!backend) {
    return undefined
  }

  const result = await fetchCatalogJson(
    new URL(`/api/v1/${kind}/${encodeURIComponent(slug)}/`, backend),
    env,
  )
  if (result.kind === 'missing') {
    return getNotFoundPageSeo(kind === 'products' ? 'Product' : 'Plugin')
  }
  if (result.kind !== 'ok' || !hasCatalogShape(result.body)) {
    return undefined
  }

  return kind === 'products'
    ? getProductPageSeo(result.body as PublicProductDetail, siteOrigin)
    : getPluginPageSeo(result.body as PublicPluginDetail, siteOrigin)
}

/** Head content for a page path, or undefined when the client should render its own head. */
async function resolvePageSeo(
  path: string,
  env: WorkerEnv,
  siteOrigin: string,
): Promise<PageSeo | undefined> {
  const staticSeo = getStaticPageSeo(path, siteOrigin)
  if (staticSeo) {
    return staticSeo
  }

  const categoryMatch = /^\/3d-models\/([a-z0-9_-]+)$/i.exec(path)
  if (categoryMatch) {
    const backend = optionalBackendOrigin(env.BACKEND_ORIGIN)
    if (!backend) return undefined
    const slug = categoryMatch[1].toLowerCase()
    // Follow pagination using our own origin, never an upstream-supplied URL.
    for (let page = 1; page <= 20; page += 1) {
      const url = new URL('/api/v1/categories/', backend)
      url.searchParams.set('page_size', '100')
      url.searchParams.set('page', String(page))
      const result = await fetchCatalogJson(url, env)
      if (result.kind !== 'ok' || typeof result.body !== 'object' || !result.body) return undefined
      const body = result.body as { results?: { id: string; slug: string; name: string }[]; next?: unknown }
      if (!Array.isArray(body.results)) return undefined
      const category = body.results.find((item) => item.slug === slug)
      if (category) {
        const copy = getCategorySeo(slug, category.name)
        const productsUrl = new URL('/api/v1/products/', backend)
        productsUrl.searchParams.set('category_id', category.id)
        productsUrl.searchParams.set('page_size', '1')
        const products = await fetchCatalogJson(productsUrl, env)
        const listing = products.kind === 'ok' ? products.body as { results?: unknown[] } : null
        const empty = Array.isArray(listing?.results) && listing.results.length === 0
        return {
          title: buildCategoryTitle(copy), description: copy.description, ogType: 'website', status: 200,
          canonicalPath: categoryPath(slug),
          robots: !copy.indexable || empty ? 'noindex, follow' : undefined,
          structuredData: {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteOrigin}/` },
              { '@type': 'ListItem', position: 2, name: '3D Models', item: `${siteOrigin}/3d-models` },
              { '@type': 'ListItem', position: 3, name: copy.h1, item: `${siteOrigin}${categoryPath(slug)}` },
            ],
          },
        }
      }
      if (!body.next) {
        return { title: 'Category not found | AssetHive3D', description: 'The requested category could not be found.', ogType: 'website', status: 404, robots: 'noindex, nofollow' }
      }
    }
    return undefined
  }

  const match = DETAIL_ROUTE.exec(path)
  if (!match) {
    // An address the app has no page for: answer 404 so it is not indexed as a copy of the home page.
    return isKnownAppPath(path) ? undefined : getNotFoundPageSeo('Page')
  }

  const kind = match[1].toLowerCase() as CatalogKind
  if (!SLUG_PATTERN.test(match[2])) {
    // No product or plugin can have this address.
    return getNotFoundPageSeo(kind === 'products' ? 'Product' : 'Plugin')
  }
  return resolveDetailSeo(kind, match[2], env, siteOrigin)
}


function isHtmlResponse(response: Response): boolean {
  return (response.headers.get('Content-Type') ?? '').toLowerCase().includes('text/html')
}

async function handleSitePath(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  const siteOrigin = resolveSiteOrigin(env, url)

  const assetResponse = await env.ASSETS.fetch(request)

  const isHead = request.method === 'HEAD'
  if (
    (request.method !== 'GET' && !isHead) ||
    !assetResponse.ok ||
    !isHtmlResponse(assetResponse) ||
    isLikelyAssetPath(url.pathname)
  ) {
    return withSecurityHeaders(assetResponse)
  }

  const path = normalizePath(url.pathname)
  const seo = await resolvePageSeo(path, env, siteOrigin)
  if (!seo) {
    return withSecurityHeaders(assetResponse)
  }
  if ((path === '/3d-models' || path.startsWith('/3d-models/') || path === '/plugins') && url.searchParams.get('search')?.trim()) {
    seo.robots = 'noindex, follow'
  }

  const headers = new Headers(assetResponse.headers)
  headers.delete('Content-Length')
  headers.delete('ETag')
  if (seo.robots) {
    headers.set('X-Robots-Tag', seo.robots)
  }
  // Link checkers and crawlers often ask with HEAD; they must see the same status as GET.
  if (isHead) {
    return withSecurityHeaders(new Response(null, { status: seo.status, headers }))
  }

  const html = renderSeoHead(await assetResponse.text(), seo, { origin: siteOrigin, path })
  return withSecurityHeaders(new Response(html, { status: seo.status, headers }))
}

export async function handleRequest(
  request: Request,
  env: WorkerEnv,
  ctx?: WorkerContext,
): Promise<Response> {
  const incomingUrl = new URL(request.url)
  if (incomingUrl.pathname === '/robots.txt') {
    return withSecurityHeaders(await robotsTxt(request, env, incomingUrl))
  }
  if (!isApiPath(incomingUrl.pathname) && incomingUrl.pathname !== SITEMAP_PATH) {
    return handleSitePath(request, env, incomingUrl)
  }

  let origin: URL
  try {
    origin = backendOrigin(env.BACKEND_ORIGIN)
  } catch {
    return errorResponse(503, 'API proxy is not configured.')
  }

  const cache = isEdgeCacheable(request, incomingUrl) ? edgeCache() : undefined
  // Keyed on the address alone: these answers do not depend on who asks.
  const cacheKey = new Request(incomingUrl.toString(), { method: 'GET' })
  if (cache) {
    const stored = await cache.match(cacheKey).catch(() => undefined)
    if (stored) {
      return fromStoredCopy(stored, request)
    }
  }

  const upstreamPath = incomingUrl.pathname === SITEMAP_PATH ? UPSTREAM_SITEMAP_PATH : incomingUrl.pathname
  const upstreamUrl = new URL(`${upstreamPath}${incomingUrl.search}`, origin)
  const headers = new Headers(request.headers)
  headers.delete('host')
  // Drop anything a visitor could use to pose as someone else; the backend must only see
  // the IP and signature set below.
  for (const name of ['x-real-ip', 'x-forwarded-for', 'x-edge-secret', 'x-edge-client-ip']) {
    headers.delete(name)
  }
  if (env.EDGE_SHARED_SECRET) {
    headers.set('X-Edge-Secret', env.EDGE_SHARED_SECRET)
    const visitorIp = request.headers.get('CF-Connecting-IP')
    if (visitorIp) {
      headers.set('X-Edge-Client-IP', visitorIp)
    }
  }
  headers.set('X-Forwarded-Host', incomingUrl.host)
  headers.set('X-Forwarded-Proto', 'https')
  if (cache) {
    // A full answer is needed to fill the cache; the visitor's own tag is checked on the way out.
    headers.delete('If-None-Match')
    headers.delete('If-Modified-Since')
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    redirect: 'manual',
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    init.duplex = 'half'
  }

  try {
    const response = await fetch(new Request(upstreamUrl, init))
    // The backend may still have the previous frontend origin during a domain move.
    // Keep its catalog selection and paths, but publish the same origin as our canonicals.
    if (incomingUrl.pathname === SITEMAP_PATH && request.method === 'GET' && response.ok &&
      (response.headers.get('Content-Type') ?? '').toLowerCase().includes('xml')) {
      const siteOrigin = escapeHtml(resolveSiteOrigin(env, incomingUrl))
      const xml = (await response.text()).replace(
        /<loc>https?:\/\/[^/<\s]+([^<]*)<\/loc>/g,
        (_match, path: string) => `<loc>${siteOrigin}${path || '/'}</loc>`,
      )
      const sitemapHeaders = new Headers(response.headers)
      for (const header of ['Content-Length', 'Content-Encoding', 'ETag', 'Last-Modified']) {
        sitemapHeaders.delete(header)
      }
      return withSecurityHeaders(new Response(xml, { status: response.status, headers: sitemapHeaders }))
    }
    const seconds = cache ? sharedMaxAge(response) : 0
    if (cache && seconds > 0) {
      const store = cache.put(cacheKey, toStoredCopy(response.clone(), seconds)).catch(() => undefined)
      if (ctx) ctx.waitUntil(store)
      else await store
      const headers = new Headers(response.headers)
      headers.set('X-Edge-Cache', 'MISS')
      return conditionalResponse(request, response.body, headers)
    }
    return response
  } catch {
    return errorResponse(502, 'The API service is temporarily unavailable.')
  }
}

export default {
  fetch: (request: Request, env: WorkerEnv, ctx?: WorkerContext) => handleRequest(request, env, ctx),
}
