import { afterEach, describe, expect, it, vi } from 'vitest'

import worker, { type WorkerEnv } from './index'

const BACKEND_ORIGIN = 'https://api.example.test'
const SHELL = `<!doctype html>
<html lang="en">
<head>
  <title>AssetHive3D</title>
  <meta name="description" content="Default" />
</head>
<body><div id="root"></div></body>
</html>`

const product = {
  id: 'prod-1',
  name: 'Desk Lamp',
  slug: 'desk-lamp',
  short_description: 'A warm desk lamp model.',
  thumbnail: 'https://cdn.example.test/lamp.jpg',
  price: '19.00',
  currency: 'USD',
  discount_price: '15.00',
  average_rating: '4.5',
  review_count: 8,
  category: { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
}

const plugin = {
  id: 'plug-1',
  name: 'UV Tools',
  slug: 'uv-tools',
  short_description: 'Fast UV unwrapping.',
  thumbnail: '',
  price: '0.00',
  currency: 'USD',
  discount_price: null,
  version: '2.0',
  compatibility: 'Blender 4.x',
  average_rating: '0',
  review_count: 0,
  category: { id: 'pcat-1', name: 'Modeling', slug: 'modeling' },
}

function createEnv(assetResponse: Response = htmlShell()): WorkerEnv {
  return {
    BACKEND_ORIGIN: BACKEND_ORIGIN,
    ASSETS: { fetch: vi.fn().mockResolvedValue(assetResponse) },
  }
}

function htmlShell(): Response {
  return new Response(SHELL, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('server-rendered page head', () => {
  it('renders product tags and structured data into the shell', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(product)))

    const response = await worker.fetch(
      new Request('https://shop.example/products/desk-lamp'),
      createEnv(),
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('<title>Desk Lamp | 3D Model | AssetHive3D</title>')
    expect(html).toContain('property="og:type" content="product"')
    expect(html).toContain('href="https://shop.example/products/desk-lamp"')
    expect(html).toContain('id="seo-structured-data"')
    expect(html).not.toContain('content="Default"')
  })

  it('loads the product from the backend detail endpoint', async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json(product))
    vi.stubGlobal('fetch', upstream)

    await worker.fetch(new Request('https://shop.example/products/desk-lamp'), createEnv())

    const called = upstream.mock.calls[0]?.[0] as URL
    expect(called.toString()).toBe(`${BACKEND_ORIGIN}/api/v1/products/desk-lamp/`)
  })

  it('renders plugin tags from the plugin detail endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(plugin)))

    const response = await worker.fetch(
      new Request('https://shop.example/plugins/uv-tools/'),
      createEnv(),
    )
    const html = await response.text()

    expect(html).toContain('<title>UV Tools | 3D Plugin | AssetHive3D</title>')
    expect(html).toContain('"@type":"SoftwareApplication"')
  })

  it('answers 404 with noindex for an unknown product', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })))

    const response = await worker.fetch(
      new Request('https://shop.example/products/missing-item'),
      createEnv(),
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(await response.text()).toContain('<title>Product not found | AssetHive3D</title>')
  })

  it('serves the plain shell when the backend cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const response = await worker.fetch(
      new Request('https://shop.example/products/desk-lamp'),
      createEnv(),
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('content="Default"')
    expect(html).not.toContain('seo-structured-data')
  })

  it('does not call the backend for paths without a catalog entry', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)

    await worker.fetch(new Request('https://shop.example/dashboard/orders'), createEnv())

    expect(upstream).not.toHaveBeenCalled()
  })

  it('adds static page tags to the home page without a backend call', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)

    const response = await worker.fetch(new Request('https://shop.example/'), createEnv())
    const html = await response.text()

    expect(html).toContain('<title>AssetHive3D | Premium 3D Models, Plugins &amp; Custom 3D Projects</title>')
    expect(upstream).not.toHaveBeenCalled()
  })

  it('uses SITE_URL for canonical URLs when it is configured', async () => {
    const env = { ...createEnv(), SITE_URL: 'https://www.shop.example/' }

    const response = await worker.fetch(new Request('https://preview.workers.dev/about'), env)

    expect(await response.text()).toContain('href="https://www.shop.example/about"')
  })

  it('leaves asset requests untouched', async () => {
    const env = createEnv(
      new Response('console.log(1)', { headers: { 'Content-Type': 'application/javascript' } }),
    )

    const response = await worker.fetch(new Request('https://shop.example/assets/app.js'), env)

    expect(await response.text()).toBe('console.log(1)')
  })
})

// Backend sitemap proxy behavior is covered in index.test.ts.

describe('robots.txt', () => {
  it('appends the absolute sitemap location to the static rules', async () => {
    const env = createEnv(
      new Response('User-agent: *\nAllow: /\nDisallow: /cart\n', {
        headers: { 'Content-Type': 'text/plain' },
      }),
    )

    const response = await worker.fetch(new Request('https://shop.example/robots.txt'), env)
    const body = await response.text()

    expect(body).toContain('Disallow: /cart')
    expect(body).toContain('Sitemap: https://shop.example/sitemap.xml')
    expect(response.headers.get('Content-Type')).toContain('text/plain')
  })
})
