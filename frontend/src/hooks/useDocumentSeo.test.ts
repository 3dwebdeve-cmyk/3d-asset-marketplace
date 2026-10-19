import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useDocumentSeo } from './useDocumentSeo'

function metaContent(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute('content') ?? null
}

function structuredDataScripts(): HTMLScriptElement[] {
  return Array.from(document.head.querySelectorAll<HTMLScriptElement>('script#seo-structured-data'))
}

beforeEach(() => {
  // Set the head first: replacing innerHTML would also remove a <title> set before it.
  document.head.innerHTML = [
    '<title>Original title</title>',
    '<meta name="description" content="Original description" />',
  ].join('')
})

afterEach(() => {
  document.head.innerHTML = ''
})

describe('useDocumentSeo', () => {
  it('sets title, description, keywords and social tags', () => {
    renderHook(() =>
      useDocumentSeo({
        title: 'Blue Chair | AssetHive3D',
        description: 'A blue chair model.',
        keywords: ['chair', '3D model'],
        ogType: 'product',
      }),
    )

    expect(document.title).toBe('Blue Chair | AssetHive3D')
    expect(metaContent('meta[name="description"]')).toBe('A blue chair model.')
    expect(metaContent('meta[name="keywords"]')).toBe('chair, 3D model')
    expect(metaContent('meta[property="og:title"]')).toBe('Blue Chair | AssetHive3D')
    expect(metaContent('meta[property="og:description"]')).toBe('A blue chair model.')
    expect(metaContent('meta[property="og:type"]')).toBe('product')
    expect(metaContent('meta[property="og:site_name"]')).toBe('AssetHive3D')
    expect(metaContent('meta[name="twitter:card"]')).toBe('summary_large_image')
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${window.location.origin}/`,
    )
  })

  it('resolves the social image to an absolute URL and falls back to the site banner', () => {
    renderHook(() => useDocumentSeo({ title: 'Home', description: 'Home page' }))

    expect(metaContent('meta[property="og:image"]')).toBe(
      `${window.location.origin}/og-default.jpg`,
    )

    renderHook(() =>
      useDocumentSeo({ title: 'Plugin', description: 'Plugin page', image: '/images/plugin.png' }),
    )

    expect(metaContent('meta[property="og:image"]')).toBe(
      `${window.location.origin}/images/plugin.png`,
    )
  })

  it('writes structured data with the canonical url and escapes "<"', () => {
    renderHook(() =>
      useDocumentSeo({
        title: 'Product',
        description: 'Product page',
        structuredData: { '@type': 'Product', name: 'Chair </script>' },
      }),
    )

    const [script] = structuredDataScripts()
    expect(script.type).toBe('application/ld+json')
    expect(script.textContent).not.toContain('</script>')

    const data = JSON.parse(script.textContent ?? '{}')
    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('Product')
    expect(data.name).toBe('Chair </script>')
    expect(data.url).toBe(`${window.location.origin}/`)
  })

  it('restores the previous head state on unmount', () => {
    const { unmount } = renderHook(() =>
      useDocumentSeo({
        title: 'Temporary',
        description: 'Temporary description',
        robots: 'noindex, nofollow',
        structuredData: { '@type': 'Product', name: 'Temporary' },
      }),
    )

    expect(document.head.querySelector('meta[name="robots"]')).not.toBeNull()

    unmount()

    expect(document.title).toBe('Original title')
    expect(metaContent('meta[name="description"]')).toBe('Original description')
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
    expect(document.head.querySelector('meta[property="og:title"]')).toBeNull()
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
    expect(structuredDataScripts()).toHaveLength(0)
  })

  it('replaces structured data that the server already rendered', () => {
    document.head.insertAdjacentHTML(
      'beforeend',
      '<script type="application/ld+json" id="seo-structured-data" data-seo-ssr>{"name":"Server"}</script>',
    )

    renderHook(() =>
      useDocumentSeo({
        title: 'Client',
        description: 'Client description',
        structuredData: { '@type': 'Product', name: 'Client' },
      }),
    )

    const scripts = structuredDataScripts()
    expect(scripts).toHaveLength(1)
    expect(scripts[0].hasAttribute('data-seo-ssr')).toBe(false)
    expect(JSON.parse(scripts[0].textContent ?? '{}').name).toBe('Client')
  })

  it('keeps the title set by a parent route when no title is given', () => {
    renderHook(() => useDocumentSeo({ title: 'Parent route', description: 'Parent' }))
    renderHook(() => useDocumentSeo({ robots: 'noindex, nofollow' }))

    expect(document.title).toBe('Parent route')
    expect(metaContent('meta[name="robots"]')).toBe('noindex, nofollow')
  })
})
