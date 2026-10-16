import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDocumentSeo } from './useDocumentSeo'

const jsonLdScripts = () => [...document.head.querySelectorAll('script[type="application/ld+json"]')]
const meta = (selector: string) => document.head.querySelector(selector)

beforeEach(() => {
  vi.stubEnv('VITE_SITE_URL', 'https://assethive3d.com')
  document.head.innerHTML =
    '<meta name="description" content="Default description" />' +
    '<meta property="og:title" content="Default og title" />'
  // Set after the head is rebuilt: replacing the head also removes the <title> element.
  document.title = 'Default title'
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('useDocumentSeo', () => {
  it('sets the title, description, canonical address, social card and structured data', () => {
    renderHook(() =>
      useDocumentSeo({
        title: 'Furniture 3D Models | AssetHive3D',
        description: 'Furniture models.',
        canonicalPath: '/3d-models/furniture',
        image: '/images/furniture.jpg',
        jsonLd: { '@context': 'https://schema.org', '@type': 'ItemList' },
      }),
    )

    expect(document.title).toBe('Furniture 3D Models | AssetHive3D')
    expect(meta('meta[name="description"]')).toHaveAttribute('content', 'Furniture models.')
    expect(meta('link[rel="canonical"]')).toHaveAttribute('href', 'https://assethive3d.com/3d-models/furniture')
    expect(meta('meta[property="og:url"]')).toHaveAttribute('content', 'https://assethive3d.com/3d-models/furniture')
    expect(meta('meta[property="og:title"]')).toHaveAttribute('content', 'Furniture 3D Models | AssetHive3D')
    expect(meta('meta[property="og:description"]')).toHaveAttribute('content', 'Furniture models.')
    expect(meta('meta[property="og:type"]')).toHaveAttribute('content', 'website')
    expect(meta('meta[property="og:site_name"]')).toHaveAttribute('content', 'AssetHive3D')
    expect(meta('meta[property="og:image"]')).toHaveAttribute('content', 'https://assethive3d.com/images/furniture.jpg')
    expect(meta('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
    expect(meta('meta[name="twitter:title"]')).toHaveAttribute('content', 'Furniture 3D Models | AssetHive3D')
    expect(meta('meta[name="twitter:image"]')).toHaveAttribute('content', 'https://assethive3d.com/images/furniture.jpg')
    expect(jsonLdScripts()).toHaveLength(1)
    expect(JSON.parse(jsonLdScripts()[0].textContent ?? '')['@type']).toBe('ItemList')
  })

  it('uses the site card when a page has no image of its own', () => {
    renderHook(() => useDocumentSeo({ title: 'T', description: 'D' }))
    expect(meta('meta[property="og:image"]')).toHaveAttribute('content', 'https://assethive3d.com/og-default.jpg')
  })

  it('puts the head back exactly as it was when the page is left', () => {
    const { unmount } = renderHook(() =>
      useDocumentSeo({
        title: 'Page',
        description: 'Page description',
        canonicalPath: '/page',
        robots: 'noindex',
        jsonLd: [{ '@type': 'Thing' }],
      }),
    )
    unmount()

    expect(document.title).toBe('Default title')
    expect(meta('meta[name="description"]')).toHaveAttribute('content', 'Default description')
    expect(meta('meta[property="og:title"]')).toHaveAttribute('content', 'Default og title')
    expect(meta('link[rel="canonical"]')).toBeNull()
    expect(meta('meta[name="robots"]')).toBeNull()
    expect(meta('meta[property="og:url"]')).toBeNull()
    expect(meta('meta[name="twitter:card"]')).toBeNull()
    expect(jsonLdScripts()).toHaveLength(0)
  })

  it('does not stack tags when the page updates', () => {
    const { rerender } = renderHook(
      ({ title }) =>
        useDocumentSeo({ title, description: 'D', canonicalPath: '/p', jsonLd: { '@type': 'Thing' } }),
      { initialProps: { title: 'First' } },
    )
    rerender({ title: 'Second' })
    rerender({ title: 'Third' })

    expect(document.title).toBe('Third')
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1)
    expect(jsonLdScripts()).toHaveLength(1)
  })

  it('does not re-create structured data when only an equal object is passed again', () => {
    const { rerender } = renderHook(
      () => useDocumentSeo({ title: 'T', description: 'D', jsonLd: { '@type': 'Thing', name: 'a' } }),
    )
    const first = jsonLdScripts()[0]
    rerender()
    expect(jsonLdScripts()[0]).toBe(first)
  })

  it('only touches the robots tag when asked to', () => {
    renderHook(() => useDocumentSeo({ title: 'T', description: 'D' }))
    expect(meta('meta[name="robots"]')).toBeNull()

    renderHook(() => useDocumentSeo({ title: 'T', description: 'D', robots: 'noindex, follow' }))
    expect(meta('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
  })

  it('can never be tricked into closing the structured-data script early', () => {
    renderHook(() =>
      useDocumentSeo({
        title: 'T',
        description: 'D',
        jsonLd: { '@type': 'Product', name: '</script><script>alert(1)</script>' },
      }),
    )

    const raw = jsonLdScripts()[0].textContent ?? ''
    expect(raw).not.toContain('<')
    expect(JSON.parse(raw).name).toBe('</script><script>alert(1)</script>')
    expect(document.head.querySelectorAll('script:not([type="application/ld+json"])')).toHaveLength(0)
  })

  it('marks a product page as a product for link previews', () => {
    renderHook(() => useDocumentSeo({ title: 'T', description: 'D', type: 'product' }))
    expect(meta('meta[property="og:type"]')).toHaveAttribute('content', 'product')
  })
})
