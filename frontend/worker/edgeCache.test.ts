import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import worker, { type WorkerEnv } from './index'

const BACKEND_ORIGIN = 'https://api.example.test'
const SITE = 'https://shop.example'
const PUBLIC_CATALOG = 'public, max-age=30, s-maxage=60, stale-while-revalidate=30'

function createEnv(): WorkerEnv {
  return {
    BACKEND_ORIGIN,
    EDGE_SHARED_SECRET: 'edge-secret',
    ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('spa')) },
  }
}

/** In-memory stand-in for Cloudflare's caches.default. */
class MemoryCache {
  readonly stored = new Map<string, Response>()

  async match(request: Request): Promise<Response | undefined> {
    return this.stored.get(request.url)?.clone()
  }

  async put(request: Request, response: Response): Promise<void> {
    this.stored.set(request.url, response.clone())
  }
}

function catalogResponse(body: unknown = { results: [] }, headers: Record<string, string> = {}): Response {
  return Response.json(body, {
    headers: { 'Cache-Control': PUBLIC_CATALOG, ETag: 'W/"v1"', Vary: 'Accept, origin', ...headers },
  })
}

let cache: MemoryCache

beforeEach(() => {
  cache = new MemoryCache()
  vi.stubGlobal('caches', { default: cache })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('edge cache for public catalog reads', () => {
  it('answers the second visitor from the edge without calling the backend', async () => {
    const upstream = vi.fn().mockImplementation(async () => catalogResponse({ results: ['chair'] }))
    vi.stubGlobal('fetch', upstream)
    const waitUntil = vi.fn()

    const first = await worker.fetch(new Request(`${SITE}/api/v1/products/?page=2`), createEnv(), { waitUntil })
    expect(first.headers.get('X-Edge-Cache')).toBe('MISS')
    expect(await first.json()).toEqual({ results: ['chair'] })
    expect(waitUntil).toHaveBeenCalledTimes(1)
    await waitUntil.mock.calls[0][0]

    const second = await worker.fetch(new Request(`${SITE}/api/v1/products/?page=2`), createEnv())
    expect(second.headers.get('X-Edge-Cache')).toBe('HIT')
    expect(await second.json()).toEqual({ results: ['chair'] })
    // Browsers get the backend's own short lifetime, not the edge one.
    expect(second.headers.get('Cache-Control')).toBe(PUBLIC_CATALOG)
    expect(second.headers.get('X-Browser-Cache-Control')).toBeNull()
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('keeps the answer only as long as the backend allows shared caches to', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => catalogResponse()))
    await worker.fetch(new Request(`${SITE}/api/v1/categories/`), createEnv())

    const stored = cache.stored.get(`${SITE}/api/v1/categories/`)
    expect(stored?.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(stored?.headers.get('Vary')).toBeNull()
  })

  it('caps the edge lifetime at five minutes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      catalogResponse({}, { 'Cache-Control': 'public, s-maxage=86400' }),
    ))
    await worker.fetch(new Request(`${SITE}/api/v1/plugins/uv-tools/`), createEnv())

    expect(cache.stored.get(`${SITE}/api/v1/plugins/uv-tools/`)?.headers.get('Cache-Control'))
      .toBe('public, max-age=300')
  })

  it('separates answers by query string', async () => {
    const upstream = vi.fn().mockImplementation(async (request: Request) =>
      catalogResponse({ url: new URL(request.url).search }),
    )
    vi.stubGlobal('fetch', upstream)

    await worker.fetch(new Request(`${SITE}/api/v1/products/?page=1`), createEnv())
    const other = await worker.fetch(new Request(`${SITE}/api/v1/products/?page=2`), createEnv())

    expect(await other.json()).toEqual({ url: '?page=2' })
    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['a private answer', { 'Cache-Control': 'private, max-age=60' }],
    ['an answer without a shared lifetime', { 'Cache-Control': 'public, max-age=30' }],
    ['an answer that sets a cookie', { 'Set-Cookie': 'session=abc' }],
    ['a no-store answer', { 'Cache-Control': 'no-store' }],
  ])('never stores %s', async (_label, headers) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => catalogResponse({}, headers)))

    const response = await worker.fetch(new Request(`${SITE}/api/v1/products/`), createEnv())

    expect(response.headers.get('X-Edge-Cache')).toBeNull()
    expect(cache.stored.size).toBe(0)
  })

  it('never stores errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      Response.json({ detail: 'down' }, { status: 503, headers: { 'Cache-Control': PUBLIC_CATALOG } }),
    ))

    await worker.fetch(new Request(`${SITE}/api/v1/products/`), createEnv())

    expect(cache.stored.size).toBe(0)
  })

  it.each([
    ['the cart', `${SITE}/api/v1/cart/`, {}],
    ['downloads', `${SITE}/api/v1/downloads/`, {}],
    ['admin lists', `${SITE}/api/v1/admin/products/`, {}],
    ['nested paths', `${SITE}/api/v1/categories/chairs/click/`, {}],
    ['a request with a sign-in token', `${SITE}/api/v1/products/`, { Authorization: 'Bearer token' }],
  ])('passes %s straight through', async (_label, url, headers) => {
    const upstream = vi.fn().mockImplementation(async () => catalogResponse())
    vi.stubGlobal('fetch', upstream)

    await worker.fetch(new Request(url, { headers }), createEnv())
    await worker.fetch(new Request(url, { headers }), createEnv())

    expect(upstream).toHaveBeenCalledTimes(2)
    expect(cache.stored.size).toBe(0)
  })

  it('does not store CORS headers meant for one caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      catalogResponse({}, {
        'Access-Control-Allow-Origin': 'https://shop.example',
        'Access-Control-Allow-Credentials': 'true',
      }),
    ))
    await worker.fetch(new Request(`${SITE}/api/v1/products/`), createEnv())

    const hit = await worker.fetch(new Request(`${SITE}/api/v1/products/`), createEnv())
    expect(hit.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(hit.headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })

  it('answers 304 when the browser already has the current version', async () => {
    const upstream = vi.fn().mockImplementation(async () => catalogResponse())
    vi.stubGlobal('fetch', upstream)
    const conditional = { 'If-None-Match': 'W/"v1"' }

    const miss = await worker.fetch(new Request(`${SITE}/api/v1/products/`, { headers: conditional }), createEnv())
    expect(miss.status).toBe(304)
    // The backend is asked for the full answer so the edge copy can be filled.
    expect((upstream.mock.calls[0][0] as Request).headers.get('If-None-Match')).toBeNull()

    const hit = await worker.fetch(new Request(`${SITE}/api/v1/products/`, { headers: conditional }), createEnv())
    expect(hit.status).toBe(304)
    expect(hit.headers.get('ETag')).toBe('W/"v1"')

    const changed = await worker.fetch(
      new Request(`${SITE}/api/v1/products/`, { headers: { 'If-None-Match': 'W/"v0"' } }),
      createEnv(),
    )
    expect(changed.status).toBe(200)
  })

  it('still answers when the edge cache fails', async () => {
    vi.stubGlobal('caches', {
      default: {
        match: vi.fn().mockRejectedValue(new Error('cache down')),
        put: vi.fn().mockRejectedValue(new Error('cache down')),
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => catalogResponse({ ok: true })))

    const response = await worker.fetch(new Request(`${SITE}/api/v1/products/`), createEnv())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
})

describe('page head lookups', () => {
  it('sign their backend calls so they pass the backend edge check', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', upstream)
    const env: WorkerEnv = {
      ...createEnv(),
      ASSETS: {
        fetch: vi.fn().mockResolvedValue(
          new Response('<html><head><title>x</title></head></html>', { headers: { 'Content-Type': 'text/html' } }),
        ),
      },
    }

    await worker.fetch(new Request(`${SITE}/products/desk-lamp`), env)

    const init = upstream.mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('X-Edge-Secret')).toBe('edge-secret')
  })
})
