import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HOME_HEADING } from '../src/lib/homeContent'
import type { PublicProductDetail } from '../src/types/product'
import worker, { type WorkerEnv } from './index'
import { getProductPageSeo, getStaticPageSeo, renderSeoHead } from './seo'

// Use the actual app shell: an empty-root fixture missed the preloader regression.
const shell = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
const origin = 'https://assethive3d.com'
const product = {
  id: 'product-1', name: 'Studio Desk Lamp', slug: 'studio-desk-lamp',
  short_description: 'A detailed lamp for interior visualization.', description: '',
  thumbnail: '/images/lamp.webp', images: [], price: '19.00', discount_price: null,
  currency: 'USD', average_rating: '0', review_count: 0,
  category: { id: 'lighting-1', name: 'Lighting', slug: 'lighting' },
} as unknown as PublicProductDetail

function parse(html: string) {
  return new DOMParser().parseFromString(html, 'text/html')
}

function env(): WorkerEnv {
  return {
    BACKEND_ORIGIN: 'https://api.example.test',
    ASSETS: {
      fetch: vi.fn(async () => new Response(shell, { headers: { 'Content-Type': 'text/html' } })),
    },
  }
}

function expectReadableSummary(doc: Document) {
  const summary = doc.querySelector('main#page-summary')
  expect(summary).not.toBeNull()
  expect(doc.querySelectorAll('main#page-summary')).toHaveLength(1)
  expect(summary!.closest('[hidden], [aria-hidden="true"], [inert]')).toBeNull()
  expect(summary!.querySelector('p')?.textContent?.trim()).toBeTruthy()
  expect(summary!.querySelector('a[href="/3d-models"]')).not.toBeNull()
  expect(summary!.querySelector('a[href="/categories"]')).not.toBeNull()
  expect(summary!.querySelector('a[href="/plugins"]')).not.toBeNull()
  expect(doc.querySelectorAll('.site-preloader')).toHaveLength(1)
  expect(summary!.querySelector('.site-preloader')).toBeNull()
  return summary!
}

afterEach(() => vi.unstubAllGlobals())

describe('page content in the real preloader shell', () => {
  it('includes a useful static fallback and releases visitors without JavaScript from the loader', () => {
    const doc = parse(shell)
    const summary = expectReadableSummary(doc)
    expect(summary.querySelector('h1')?.textContent).toBe(HOME_HEADING)
    const noScriptStyles = Array.from(doc.querySelectorAll('noscript style'), style => style.textContent).join('\n')
    expect(noScriptStyles).toMatch(/\.site-preloader\s*\{[^}]*display:\s*none/)
  })

  it.each(['/', '/about'])('serves readable %s page content and the preloader in the Worker response', async path => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const response = await worker.fetch(new Request(`${origin}${path}`), env())
    const summary = expectReadableSummary(parse(await response.text()))
    const seo = getStaticPageSeo(path)!
    expect(response.status).toBe(200)
    expect(summary.querySelector('h1')?.textContent).toBe(path === '/' ? HOME_HEADING : seo.title)
    expect(summary.querySelector('p')?.textContent).toBe(seo.description)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('replaces the fallback with the public product content before any client script runs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(product)))
    const response = await worker.fetch(new Request(`${origin}/products/${product.slug}`), env())
    const summary = expectReadableSummary(parse(await response.text()))
    expect(response.status).toBe(200)
    expect(summary.querySelector('h1')?.textContent).toContain(product.name)
    expect(summary.querySelector('p')?.textContent).toContain(product.short_description)
    expect(summary.textContent).not.toContain(HOME_HEADING)
  })

  it('returns a crawlable error summary with the existing 404 and noindex semantics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })))
    const response = await worker.fetch(new Request(`${origin}/products/missing`), env())
    const doc = parse(await response.text())
    const summary = expectReadableSummary(doc)
    expect(response.status).toBe(404)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow')
    expect(summary.querySelector('h1')?.textContent).toBe('Product not found | AssetHive3D')
    expect(summary.textContent).not.toContain(HOME_HEADING)
  })

  it('replaces its own summary on subsequent rendering without duplicating the content or loader', () => {
    const first = renderSeoHead(shell, getStaticPageSeo('/')!, { origin, path: '/' })
    const second = renderSeoHead(first, getStaticPageSeo('/about')!, { origin, path: '/about' })
    const summary = expectReadableSummary(parse(second))
    expect(summary.querySelectorAll('h1')).toHaveLength(1)
    expect(summary.querySelector('h1')?.textContent).toBe(getStaticPageSeo('/about')!.title)
    expect(summary.textContent).not.toContain(HOME_HEADING)
  })

  it('escapes untrusted catalog text when replacing the summary slot', () => {
    const seo = {
      ...getProductPageSeo(product, origin),
      title: 'Lamp </main><script>alert(1)</script>',
      description: '<img src=x onerror=alert(1)> A & B $&',
    }
    const doc = parse(renderSeoHead(shell, seo, { origin, path: `/products/${product.slug}` }))
    const summary = expectReadableSummary(doc)
    expect(summary.querySelector('h1')?.textContent).toBe(seo.title)
    expect(summary.querySelector('p')?.textContent).toBe(seo.description)
    expect(summary.querySelector('script, img')).toBeNull()
    expect(doc.querySelector('script:not([src]):not([type="application/ld+json"])')).toBeNull()
  })
})
