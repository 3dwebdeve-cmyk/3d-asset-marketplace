import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index'

const shell = '<html><head><title>Default</title></head><body></body></html>'
const env = {
  BACKEND_ORIGIN: 'https://api.example.test',
  ASSETS: { fetch: vi.fn(async () => new Response(shell, { headers: { 'Content-Type': 'text/html' } })) },
}
const furniture = { id: 'cat-1', name: 'Furniture', slug: 'furniture' }

afterEach(() => vi.unstubAllGlobals())

function catalog(categories = [furniture], products: unknown[] = [{ name: 'Chair' }]) {
  vi.stubGlobal('fetch', vi.fn(async (input: URL) =>
    Response.json(input.pathname === '/api/v1/categories/'
      ? { results: categories, next: null }
      : { results: products, next: null }),
  ))
}

describe('category metadata in the first HTML response', () => {
  it('includes the category title, description, clean canonical and breadcrumbs before JavaScript runs', async () => {
    catalog()
    const response = await worker.fetch(new Request('https://shop.example/3d-models/furniture?formats=blend'), env)
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('<title>Furniture 3D Models – Chairs, Sofas &amp; Tables | AssetHive3D</title>')
    expect(html).toContain('Furniture 3D models for interior design')
    expect(html).toContain('href="https://shop.example/3d-models/furniture"')
    expect(html).toContain('"@type":"BreadcrumbList"')
    expect(response.headers.get('X-Robots-Tag')).toBeNull()
  })

  it('looks through paginated categories without following external URLs', async () => {
    const fetcher = vi.fn(async (url: URL) => {
      if (url.pathname !== '/api/v1/categories/') return Response.json({ results: [{}] })
      return Response.json(url.searchParams.get('page') === '1'
        ? { results: [], next: 'https://untrusted.example/page-2' }
        : { results: [furniture], next: null })
    })
    vi.stubGlobal('fetch', fetcher)
    const response = await worker.fetch(new Request('https://shop.example/3d-models/furniture'), env)
    expect(await response.text()).toContain('Furniture 3D Models')
    expect(fetcher.mock.calls.every(([url]) => url.origin === env.BACKEND_ORIGIN)).toBe(true)
  })

  it('returns a real 404 and noindex for an unknown category', async () => {
    catalog([])
    const response = await worker.fetch(new Request('https://shop.example/3d-models/unknown'), env)
    expect(response.status).toBe(404)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(await response.text()).toContain('name="robots" content="noindex, nofollow"')
  })

  it.each(['empty', 'placeholder', 'search'])('keeps %s category results out of the index', async (kind) => {
    const slug = kind === 'placeholder' ? 'demo-assets' : 'furniture'
    catalog([{ ...furniture, slug }], kind === 'empty' ? [] : [{}])
    const response = await worker.fetch(new Request(`https://shop.example/3d-models/${slug}${kind === 'search' ? '?search=chair' : ''}`), env)
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, follow')
    expect(await response.text()).toContain('name="robots" content="noindex, follow"')
  })

  it('does not turn a backend outage into a permanent category 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unavailable')))
    const response = await worker.fetch(new Request('https://shop.example/3d-models/furniture'), env)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<title>Default</title>')
  })
})
