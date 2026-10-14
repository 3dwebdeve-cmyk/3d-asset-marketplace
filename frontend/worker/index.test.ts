import { readFileSync } from 'node:fs'

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
