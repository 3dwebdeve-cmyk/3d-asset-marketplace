import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index'

const origin = 'https://assethive3d.com'
const shell = readFileSync('index.html', 'utf8')
const env = {
  BACKEND_ORIGIN: 'https://backend.example',
  ASSETS: { fetch: async () => new Response(shell, { headers: { 'Content-Type': 'text/html' } }) },
}
const chair = { name: 'Oak Chair', slug: 'oak-chair', price: '0.00', thumbnail: '/images/chair.webp', short_description: 'A wooden chair.' }
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
afterEach(() => vi.unstubAllGlobals())

describe('crawlable model collections', () => {
  it('redirects the retired free collection to the unified catalog', async () => {
    const response = await worker.fetch(new Request(`${origin}/free-3d-models?formats=blend&page=2`), env)
    expect(response.status).toBe(301)
    expect(response.headers.get('Location')).toBe(`${origin}/3d-models?formats=blend&page=2`)
  })
  it.each(['/3d-models', '/3d-models/furniture'])(
    'renders actual models, images, schema and page links for %s', async (path) => {
      const fetcher = vi.fn(async (url: URL) => Response.json(url.pathname === '/api/v1/categories/'
        ? { results: [{ id: 'cat-1', name: 'Furniture', slug: 'furniture' }], next: null }
        : { results: [chair], next: '/api/v1/products/?page=3', count: 25 }))
      vi.stubGlobal('fetch', fetcher)
      const response = await worker.fetch(new Request(`${origin}${path}?page=2`), env)
      const doc = parse(await response.text())
      expect(response.status).toBe(200)
      expect(doc.querySelector('a[href="/products/oak-chair"]')).not.toBeNull()
      expect(doc.querySelector('img[src="https://assethive3d.com/images/chair.webp"]')?.getAttribute('alt')).toContain('Oak Chair')
      expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${origin}${path}?page=2`)
      expect(doc.querySelector(`a[href="${path}?page=3"]`)?.textContent).toBe('Next page')
      expect(doc.querySelector(`a[href="${path}"]`)?.textContent).toBe('Previous page')
      const graph = JSON.parse(doc.querySelector('#seo-structured-data')!.textContent!)['@graph']
      expect(graph.find((item: Record<string, unknown>) => item['@type'] === 'ItemList').itemListElement[0].position).toBe(13)
      const request = fetcher.mock.calls.map(([url]) => url).find((url) => url.pathname === '/api/v1/products/')!
      expect(request.searchParams.get('page_size')).toBe('12')
      expect(request.searchParams.get('page')).toBe('2')
      expect(request.searchParams.has('is_free')).toBe(false)
      if (path.endsWith('/furniture')) expect(request.searchParams.get('category_id')).toBe('cat-1')
    },
  )

  it('returns a genuine 404 for an out-of-range catalog page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })))
    const response = await worker.fetch(new Request(`${origin}/3d-models?page=999`), env)
    expect(response.status).toBe(404)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
  })

  it('keeps filtered collections out of the index without describing unrelated models', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const response = await worker.fetch(new Request(`${origin}/3d-models?max_price=0&formats=blend&page=2`), env)
    const doc = parse(await response.text())
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, follow')
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${origin}/3d-models`)
    expect(doc.querySelector('a[href="/products/oak-chair"]')).toBeNull()
  })

  it('shows public model previews without a separate free collection on the homepage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [chair], next: null })))
    const doc = parse(await (await worker.fetch(new Request(`${origin}/`), env)).text())
    expect(doc.querySelector('section[aria-label="3D models"] a')?.getAttribute('href')).toBe('/products/oak-chair')
    expect(doc.querySelector('section[aria-label="Free 3D Models"]')).toBeNull()
  })

  it('escapes model content and rejects unsafe image URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [{
      ...chair, name: '<script>alert(1)</script>', thumbnail: 'javascript:alert(1)', short_description: '<img src=x onerror=alert(1)>',
    }], next: null })))
    const doc = parse(await (await worker.fetch(new Request(`${origin}/3d-models`), env)).text())
    expect(doc.querySelector('a[href="/products/oak-chair"]')?.textContent).toBe('<script>alert(1)</script>')
    expect(doc.querySelector('img[src^="javascript:"]')).toBeNull()
    expect(doc.querySelector('[onerror]')).toBeNull()
  })
})
