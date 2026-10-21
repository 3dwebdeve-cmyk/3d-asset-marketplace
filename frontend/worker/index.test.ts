import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import worker, { SECURITY_HEADERS, type WorkerEnv } from './index'

const BACKEND_ORIGIN = 'https://threed-asset-marketplace.onrender.com'

function createEnv(assetResponse = new Response('asset')): WorkerEnv {
  return {
    BACKEND_ORIGIN,
    ASSETS: {
      fetch: vi.fn().mockResolvedValue(assetResponse),
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Cloudflare API proxy', () => {
  it('serves non-API requests from the static asset binding', async () => {
    const env = createEnv(new Response('spa'))
    const request = new Request('https://marketplace.example/products/demo-plant-pot')

    const response = await worker.fetch(request, env)

    expect(await response.text()).toBe('spa')
    expect(env.ASSETS.fetch).toHaveBeenCalledWith(request)
  })

  it('adds the security headers to static responses', async () => {
    const response = await worker.fetch(
      new Request('https://marketplace.example/'),
      createEnv(new Response('spa', { headers: { 'Content-Type': 'text/html' } })),
    )

    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000')
    expect(response.headers.get('Content-Type')).toBe('text/html')
  })

  it('keeps the security headers in sync with nginx.conf', () => {
    // Vitest runs from the frontend directory, where nginx.conf lives.
    const nginx = readFileSync('nginx.conf', 'utf-8')
    const nginxHeaders = Object.fromEntries(
      [...nginx.matchAll(/^ {4}add_header ([A-Za-z-]+) "(.*)" always;$/gm)].map((match) => [
        match[1],
        match[2],
      ]),
    )

    expect(SECURITY_HEADERS).toEqual(nginxHeaders)
  })

  it('serves the same headers to static pages through the _headers file', () => {
    // wrangler.jsonc runs the Worker only for /api, so pages get their headers from this file.
    const lines = readFileSync('public/_headers', 'utf-8').split(/\r?\n/)
    const start = lines.indexOf('/*')
    expect(start).toBeGreaterThanOrEqual(0)
    // Only this rule's lines: stop at the next URL pattern (a non-indented, non-comment line).
    const rest = lines.slice(start + 1)
    const end = rest.findIndex(
      (line) => line.trim() !== '' && !line.startsWith(' ') && !line.startsWith('#'),
    )
    const fileHeaders = Object.fromEntries(
      (end === -1 ? rest : rest.slice(0, end))
        .filter((line) => /^\s+[A-Za-z-]+: /.test(line))
        .map((line) => {
          const [name, ...value] = line.trim().split(': ')
          return [name, value.join(': ')]
        }),
    )

    expect(fileHeaders).toEqual(SECURITY_HEADERS)
  })

  describe('_headers caching and preload rules', () => {
    // Every rule in the file, in order: its URL pattern and the headers it adds.
    function readRules() {
      const rules: { pattern: string; headers: Record<string, string> }[] = []
      for (const line of readFileSync('public/_headers', 'utf-8').split(/\r?\n/)) {
        if (line.trim() === '' || line.startsWith('#')) continue
        if (!line.startsWith(' ')) {
          rules.push({ pattern: line.trim(), headers: {} })
        } else {
          const [name, ...value] = line.trim().split(': ')
          rules[rules.length - 1].headers[name] = value.join(': ')
        }
      }
      return rules
    }
    const rule = (pattern: string) => readRules().find((r) => r.pattern === pattern)

    it('keeps fingerprinted build files and fonts for a year, unchanged', () => {
      for (const pattern of ['/assets/*', '/fonts/*']) {
        expect(rule(pattern)?.headers['Cache-Control']).toBe('public, max-age=31536000, immutable')
      }
    })

    it('keeps images and models for a day, with a background refresh', () => {
      for (const extension of ['webp', 'png', 'jpg', 'gif', 'svg', 'glb', 'hdr', 'mp4']) {
        const value = rule(`/*.${extension}`)?.headers['Cache-Control']
        expect(value, extension).toMatch(/^public, max-age=86400, stale-while-revalidate=\d+$/)
      }
    })

    it('never makes pages (HTML) cacheable, and keeps Cache-Control off the security rule', () => {
      expect(rule('/*')?.headers['Cache-Control']).toBeUndefined()
      for (const pattern of ['/', '/index.html', '/*.html']) {
        expect(rule(pattern)?.headers['Cache-Control']).toBeUndefined()
      }
    })

    it('preloads only pictures and fonts that exist', () => {
      const links = readRules().filter((r) => r.headers.Link)
      expect(links.length).toBeGreaterThan(0)
      for (const { pattern, headers } of links) {
        for (const entry of headers.Link.split(/, (?=<)/)) {
          const match =
            /^<([^>]+)>; rel=preload; as=image(; fetchpriority=high)?$/.exec(entry) ??
            // A font preload must say crossorigin, or the browser fetches the font a second time.
            /^<(\/fonts\/[^>]+\.woff2)>; rel=preload; as=font; type="font\/woff2"; crossorigin$/.exec(entry)
          expect(match, `${pattern}: ${entry}`).not.toBeNull()
          const file = decodeURIComponent(match![1].split('?')[0]).replace(/^\//, '')
          expect(existsSync(join('public', file)), `${pattern} preloads ${file}`).toBe(true)
        }
      }
    })
  })

  it('keeps the workers.dev copy of the shop switched off on every deploy', () => {
    const lines = readFileSync('wrangler.jsonc', 'utf-8').split(/\r?\n/)
    const config = JSON.parse(lines.filter((line) => !line.trim().startsWith('//')).join('\n'))
    expect(config.workers_dev).toBe(false)
    expect(config.preview_urls).toBe(true)
  })

  it('no longer depends on Google Fonts (the fonts are served from /fonts)', () => {
    const policy = SECURITY_HEADERS['Content-Security-Policy']
    expect(policy).not.toContain('fonts.googleapis.com')
    expect(policy).not.toContain('fonts.gstatic.com')
    const html = readFileSync('index.html', 'utf-8')
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
    expect(html).toContain('/fonts/plus-jakarta-sans-latin.woff2')
    expect(existsSync('public/fonts/plus-jakarta-sans-latin.woff2')).toBe(true)
  })

  it('only lets the page connect to named storage hosts', () => {
    // Anyone can create an r2.dev bucket, so a wildcard would be an exfiltration channel.
    const connectSrc = SECURITY_HEADERS['Content-Security-Policy']
      .split(';')
      .find((directive) => directive.trim().startsWith('connect-src'))

    expect(connectSrc).toBeDefined()
    expect(connectSrc).not.toContain('*.r2.dev')
    expect(connectSrc).not.toContain('*.cloudflarestorage.com')
  })

  it('forwards API paths and query strings to the configured backend', async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(
      Response.json({ status: 'ok' }, { headers: { 'Set-Cookie': 'refresh_token=token' } }),
    )
    vi.stubGlobal('fetch', upstreamFetch)

    const response = await worker.fetch(
      new Request('https://marketplace.example/api/v1/healthz/?ready=1'),
      createEnv(),
    )

    const upstreamRequest = upstreamFetch.mock.calls[0]?.[0] as Request
    expect(upstreamRequest.url).toBe(`${BACKEND_ORIGIN}/api/v1/healthz/?ready=1`)
    expect(upstreamRequest.redirect).toBe('manual')
    expect(response.headers.get('Set-Cookie')).toBe('refresh_token=token')
  })

  it('preserves authenticated POST data and checkout headers', async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal('fetch', upstreamFetch)
    const request = new Request('https://marketplace.example/api/v1/payments/checkout/', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        Cookie: 'refresh_token=refresh-token',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'checkout-attempt-1',
      },
      body: JSON.stringify({ cart: 'cart-id' }),
    })

    await worker.fetch(request, createEnv())

    const upstreamRequest = upstreamFetch.mock.calls[0]?.[0] as Request
    expect(upstreamRequest.method).toBe('POST')
    expect(upstreamRequest.headers.get('Authorization')).toBe('Bearer access-token')
    expect(upstreamRequest.headers.get('Cookie')).toBe('refresh_token=refresh-token')
    expect(upstreamRequest.headers.get('Idempotency-Key')).toBe('checkout-attempt-1')
    expect(upstreamRequest.headers.get('X-Forwarded-Host')).toBe('marketplace.example')
    expect(upstreamRequest.headers.get('X-Forwarded-Proto')).toBe('https')
    expect(await upstreamRequest.json()).toEqual({ cart: 'cart-id' })
  })

  it('signs API requests and passes the real visitor IP', async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal('fetch', upstreamFetch)
    const env = { ...createEnv(), EDGE_SHARED_SECRET: 'edge-secret' }

    await worker.fetch(
      new Request('https://marketplace.example/api/v1/products/', {
        headers: { 'CF-Connecting-IP': '198.51.100.7' },
      }),
      env,
    )

    const upstream = upstreamFetch.mock.calls[0]?.[0] as Request
    expect(upstream.headers.get('X-Edge-Secret')).toBe('edge-secret')
    expect(upstream.headers.get('X-Edge-Client-IP')).toBe('198.51.100.7')
  })

  it('discards IP and secret headers a visitor sends', async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal('fetch', upstreamFetch)
    const forged = {
      'X-Real-IP': '198.51.100.7',
      'X-Forwarded-For': '198.51.100.7',
      'X-Edge-Secret': 'guess',
      'X-Edge-Client-IP': '198.51.100.7',
      'CF-Connecting-IP': '203.0.113.50',
    }

    await worker.fetch(
      new Request('https://marketplace.example/api/v1/admin/products/', { headers: forged }),
      { ...createEnv(), EDGE_SHARED_SECRET: 'edge-secret' },
    )
    const signed = upstreamFetch.mock.calls[0]?.[0] as Request
    expect(signed.headers.get('X-Real-IP')).toBeNull()
    expect(signed.headers.get('X-Forwarded-For')).toBeNull()
    expect(signed.headers.get('X-Edge-Secret')).toBe('edge-secret')
    expect(signed.headers.get('X-Edge-Client-IP')).toBe('203.0.113.50')

    // Without a configured secret nothing forged gets through either.
    await worker.fetch(
      new Request('https://marketplace.example/api/v1/admin/products/', { headers: forged }),
      createEnv(),
    )
    const unsigned = upstreamFetch.mock.calls[1]?.[0] as Request
    expect(unsigned.headers.get('X-Real-IP')).toBeNull()
    expect(unsigned.headers.get('X-Edge-Secret')).toBeNull()
    expect(unsigned.headers.get('X-Edge-Client-IP')).toBeNull()
  })

  describe('search engine files', () => {
    it('serves robots.txt with a Sitemap line that uses the address the visitor used', async () => {
      const env = createEnv(new Response('User-agent: *\nAllow: /\nDisallow: /cart\n'))

      const response = await worker.fetch(new Request('https://shop.example/robots.txt'), env)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('text/plain')
      const body = await response.text()
      expect(body).toContain('Disallow: /cart')
      expect(body.trimEnd().endsWith('Sitemap: https://shop.example/sitemap.xml')).toBe(true)
      // A different address gets its own Sitemap line.
      const other = await worker.fetch(
        new Request('https://assethive3d.com/robots.txt'),
        createEnv(new Response('User-agent: *\nAllow: /\n')),
      )
      expect(await other.text()).toContain('Sitemap: https://assethive3d.com/sitemap.xml')
    })

    it('still serves a safe robots.txt when the static file is missing', async () => {
      const response = await worker.fetch(
        new Request('https://shop.example/robots.txt'),
        createEnv(new Response('nope', { status: 404 })),
      )
      const body = await response.text()
      expect(body).toContain('User-agent: *')
      expect(body).toContain('Sitemap: https://shop.example/sitemap.xml')
    })

    it('only answers GET and HEAD for robots.txt', async () => {
      const response = await worker.fetch(
        new Request('https://shop.example/robots.txt', { method: 'POST' }),
        createEnv(),
      )
      expect(response.status).toBe(405)
    })

    it('fetches the sitemap from the backend, signed like any other API request', async () => {
      const upstreamFetch = vi.fn().mockResolvedValue(
        new Response('<urlset/>', { headers: { 'Content-Type': 'application/xml' } }),
      )
      vi.stubGlobal('fetch', upstreamFetch)

      const response = await worker.fetch(
        new Request('https://shop.example/sitemap.xml', { headers: { 'CF-Connecting-IP': '198.51.100.7' } }),
        { ...createEnv(), EDGE_SHARED_SECRET: 'edge-secret' },
      )

      const upstream = upstreamFetch.mock.calls[0]?.[0] as Request
      expect(upstream.url).toBe(`${BACKEND_ORIGIN}/api/v1/sitemap.xml`)
      expect(upstream.headers.get('X-Edge-Secret')).toBe('edge-secret')
      expect(response.headers.get('Content-Type')).toBe('application/xml')
      expect(await response.text()).toBe('<urlset/>')
    })

    it('does not treat other paths that merely contain the word sitemap as the sitemap', async () => {
      const env = createEnv(new Response('spa'))
      await worker.fetch(new Request('https://shop.example/sitemap.xml.bak'), env)
      await worker.fetch(new Request('https://shop.example/products/sitemap.xml'), env)
      expect(env.ASSETS.fetch).toHaveBeenCalledTimes(2)
    })

    it('publishes canonical sitemap locations while preserving catalog paths and XML escaping', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
        '<urlset><url><loc>https://old.workers.dev/</loc></url><url><loc>https://old.workers.dev/products/chair?a=1&amp;b=2</loc><lastmod>2026-10-01</lastmod></url></urlset>',
        { headers: { 'Content-Type': 'application/xml', ETag: 'old-body', 'Content-Length': '999' } },
      )))
      const response = await worker.fetch(new Request('https://www.assethive3d.com/sitemap.xml'), {
        ...createEnv(), SITE_URL: 'https://assethive3d.com',
      })
      const xml = await response.text()
      expect(xml).toContain('<loc>https://assethive3d.com/</loc>')
      expect(xml).toContain('<loc>https://assethive3d.com/products/chair?a=1&amp;b=2</loc>')
      expect(xml).toContain('<lastmod>2026-10-01</lastmod>')
      expect(xml).not.toContain('old.workers.dev')
      expect(response.headers.get('ETag')).toBeNull()
      expect(response.headers.get('Content-Length')).toBeNull()
    })

    it('preserves backend sitemap errors instead of advertising a partial sitemap', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })))
      const response = await worker.fetch(new Request('https://assethive3d.com/sitemap.xml'), {
        ...createEnv(), SITE_URL: 'https://assethive3d.com',
      })
      expect(response.status).toBe(503)
      expect(await response.text()).toBe('Unavailable')
    })
  })

  it('fails closed when the backend origin is missing or unsafe', async () => {
    const upstreamFetch = vi.fn()
    vi.stubGlobal('fetch', upstreamFetch)
    const request = new Request('https://marketplace.example/api/v1/healthz/')
    const env = createEnv()

    env.BACKEND_ORIGIN = 'http://insecure.example/path'
    const response = await worker.fetch(request, env)

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it('returns a sanitized error when Render cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private upstream detail')))

    const response = await worker.fetch(
      new Request('https://marketplace.example/api/v1/healthz/'),
      createEnv(),
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      detail: 'The API service is temporarily unavailable.',
    })
  })
})
