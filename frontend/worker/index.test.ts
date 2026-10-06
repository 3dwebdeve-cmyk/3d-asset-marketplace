import { afterEach, describe, expect, it, vi } from 'vitest'

import worker, { type WorkerEnv } from './index'

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
