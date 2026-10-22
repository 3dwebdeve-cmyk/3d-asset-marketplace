/** Short edge caching of public catalog API answers (Cloudflare's cache, keyed by address). */

// Public catalog reads (lists and detail pages of categories, products and plugins). Their answers
// are the same for every visitor; the backend still decides by sending `public, s-maxage=N`.
const EDGE_CACHEABLE_API = /^\/api\/v1\/(categories|products|plugins|plugin-categories)\/([a-z0-9_-]+\/)?$/i
const EDGE_CACHE_MAX_SECONDS = 300
const BROWSER_CACHE_HEADER = 'X-Browser-Cache-Control'
// Never stored: they belong to one visitor or one cross-site caller.
const UNSHAREABLE_HEADERS = [
  'Set-Cookie',
  'Vary',
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Credentials',
  'Access-Control-Expose-Headers',
]

export function edgeCache(): Cache | undefined {
  return typeof caches === 'undefined' ? undefined : (caches as unknown as { default: Cache }).default
}

export function isEdgeCacheable(request: Request, url: URL): boolean {
  return (
    request.method === 'GET' &&
    EDGE_CACHEABLE_API.test(url.pathname) &&
    !request.headers.has('Authorization')
  )
}

/** Seconds a shared cache may keep the answer, from the backend's own header; 0 = do not keep. */
export function sharedMaxAge(response: Response): number {
  if (response.status !== 200 || response.headers.has('Set-Cookie')) return 0
  if (!(response.headers.get('Content-Type') ?? '').toLowerCase().includes('application/json')) return 0
  const cacheControl = (response.headers.get('Cache-Control') ?? '').toLowerCase()
  if (!/(^|[\s,])public([\s,]|$)/.test(cacheControl) || /no-store|private/.test(cacheControl)) return 0
  const match = /s-maxage=(\d+)/.exec(cacheControl)
  return match ? Math.min(Number(match[1]), EDGE_CACHE_MAX_SECONDS) : 0
}

function etagMatches(ifNoneMatch: string | null, etag: string | null): boolean {
  if (!ifNoneMatch || !etag) return false
  const strip = (tag: string) => tag.trim().replace(/^W\//, '')
  return ifNoneMatch.split(',').some((tag) => tag.trim() === '*' || strip(tag) === strip(etag))
}

/** 304 when the visitor already has this version, otherwise the answer with the given headers. */
export function conditionalResponse(request: Request, body: BodyInit | null, headers: Headers): Response {
  if (etagMatches(request.headers.get('If-None-Match'), headers.get('ETag'))) {
    for (const name of ['Content-Length', 'Content-Type', 'Content-Encoding']) headers.delete(name)
    return new Response(null, { status: 304, headers })
  }
  return new Response(body, { status: 200, headers })
}

/** The stored copy keeps the backend's browser header aside; the cache itself uses s-maxage. */
export function toStoredCopy(response: Response, seconds: number): Response {
  const headers = new Headers(response.headers)
  for (const name of UNSHAREABLE_HEADERS) headers.delete(name)
  headers.set(BROWSER_CACHE_HEADER, response.headers.get('Cache-Control') ?? '')
  headers.set('Cache-Control', `public, max-age=${seconds}`)
  return new Response(response.body, { status: response.status, headers })
}

export function fromStoredCopy(stored: Response, request: Request): Response {
  const headers = new Headers(stored.headers)
  headers.set('Cache-Control', headers.get(BROWSER_CACHE_HEADER) || 'no-cache')
  headers.delete(BROWSER_CACHE_HEADER)
  headers.set('X-Edge-Cache', 'HIT')
  return conditionalResponse(request, stored.body, headers)
}
