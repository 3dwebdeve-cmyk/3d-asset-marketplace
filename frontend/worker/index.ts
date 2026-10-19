import {
  appendSitemapLine,
  buildSitemapXml,
  getNotFoundPageSeo,
  getPluginPageSeo,
  getProductPageSeo,
  getStaticPageSeo,
  isLikelyAssetPath,
  normalizePath,
  renderSeoHead,
  SLUG_PATTERN,
  type PageSeo,
} from './seo'
import { STATIC_PAGE_SEO } from '../src/lib/seoPages'
import type { PublicPluginDetail } from '../src/types/plugin'
import type { PublicProductDetail } from '../src/types/product'

interface AssetsBinding {
  fetch(request: Request): Promise<Response>
}

export interface WorkerEnv {
  ASSETS: AssetsBinding
  BACKEND_ORIGIN?: string
  /** Public origin for canonical URLs and the sitemap, e.g. https://example.com. Defaults to the request origin. */
  SITE_URL?: string
}

type CatalogKind = 'products' | 'plugins'

// Product and plugin detail routes, e.g. /products/desk-lamp or /Plugins/uv-tools.
const DETAIL_ROUTE = /^\/(products|plugins)\/([^/]+)$/i
const DETAIL_TIMEOUT_MS = 4000
const CATALOG_CACHE_TTL_SECONDS = 300
// 50 pages of 100 covers 5,000 items per catalog, well above the current size.
const MAX_SITEMAP_PAGES = 50

// Same security headers nginx sends for the SPA (frontend/nginx.conf). The Worker
// serves static assets directly, so without these the Cloudflare deploy has no CSP.
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' blob: https://accounts.google.com https://*.googleapis.com https://*.sentry.io https://*.ingest.sentry.io https://pub-a20fb6d206fc47a1b1e5e247e82838e0.r2.dev https://0d3f756f61c3239ec77f9941c82c20c3.r2.cloudflarestorage.com; worker-src 'self' blob:; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; report-uri /api/v1/security/csp-report/",
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
async function fetchCatalogJson(url: URL): Promise<CatalogFetchResult> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
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
  const staticSeo = getStaticPageSeo(path)
  if (staticSeo) {
    return staticSeo
  }

  const match = DETAIL_ROUTE.exec(path)
  if (!match || !SLUG_PATTERN.test(match[2])) {
    return undefined
  }

  const kind = match[1].toLowerCase() as CatalogKind
  return resolveDetailSeo(kind, match[2], env, siteOrigin)
}

async function listCatalogSlugs(kind: CatalogKind, env: WorkerEnv): Promise<string[]> {
  const backend = optionalBackendOrigin(env.BACKEND_ORIGIN)
  if (!backend) {
    return []
  }

  const slugs: string[] = []
  for (let page = 1; page <= MAX_SITEMAP_PAGES; page += 1) {
    const url = new URL(`/api/v1/${kind}/`, backend)
    url.searchParams.set('page', String(page))
    url.searchParams.set('page_size', '100')

    const result = await fetchCatalogJson(url)
    if (result.kind !== 'ok') {
      break
    }

    const body = (result.body ?? {}) as { results?: unknown; next?: unknown }
    const results = Array.isArray(body.results) ? body.results : []
    for (const item of results as { slug?: unknown }[]) {
      if (typeof item.slug === 'string' && SLUG_PATTERN.test(item.slug)) {
        slugs.push(item.slug)
      }
    }

    if (!body.next) {
      break
    }
  }
  return slugs
}

async function buildSitemapResponse(siteOrigin: string, env: WorkerEnv): Promise<Response> {
  const [products, plugins] = await Promise.all([
    listCatalogSlugs('products', env),
    listCatalogSlugs('plugins', env),
  ])
  const paths = [
    ...Object.keys(STATIC_PAGE_SEO),
    ...products.map((slug) => `/products/${slug}`),
    ...plugins.map((slug) => `/plugins/${slug}`),
  ]

  return new Response(buildSitemapXml(siteOrigin, paths), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

function isHtmlResponse(response: Response): boolean {
  return (response.headers.get('Content-Type') ?? '').toLowerCase().includes('text/html')
}

async function handleSitePath(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  const siteOrigin = resolveSiteOrigin(env, url)

  if (request.method === 'GET' && url.pathname === '/sitemap.xml') {
    return withSecurityHeaders(await buildSitemapResponse(siteOrigin, env))
  }

  const assetResponse = await env.ASSETS.fetch(request)

  if (request.method === 'GET' && url.pathname === '/robots.txt' && assetResponse.ok) {
    const robots = appendSitemapLine(await assetResponse.text(), siteOrigin)
    return withSecurityHeaders(
      new Response(robots, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      }),
    )
  }

  if (
    request.method !== 'GET' ||
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

  const headers = new Headers(assetResponse.headers)
  headers.delete('Content-Length')
  headers.delete('ETag')
  if (seo.status === 404) {
    headers.set('X-Robots-Tag', 'noindex, nofollow')
  }

  const html = renderSeoHead(await assetResponse.text(), seo, { origin: siteOrigin, path })
  return withSecurityHeaders(new Response(html, { status: seo.status, headers }))
}

export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const incomingUrl = new URL(request.url)
  if (!isApiPath(incomingUrl.pathname)) {
    return handleSitePath(request, env, incomingUrl)
  }

  let origin: URL
  try {
    origin = backendOrigin(env.BACKEND_ORIGIN)
  } catch {
    return errorResponse(503, 'API proxy is not configured.')
  }

  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, origin)
  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.set('X-Forwarded-Host', incomingUrl.host)
  headers.set('X-Forwarded-Proto', 'https')

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
    return await fetch(new Request(upstreamUrl, init))
  } catch {
    return errorResponse(502, 'The API service is temporarily unavailable.')
  }
}

export default {
  fetch: handleRequest,
}
