import { describe, expect, it } from 'vitest'

import type { PublicProductDetail } from '../src/types/product'
import { HOME_HEADING } from '../src/lib/homeContent'
import {
  appendSitemapLine,
  escapeHtml,
  getNotFoundPageSeo,
  getProductPageSeo,
  getStaticPageSeo,
  isLikelyAssetPath,
  normalizePath,
  renderSeoHead,
} from './seo'

const SHELL = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Furniture &amp; Interior 3D Models | AssetHive3D</title>
  <meta name="description" content="Default description" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="Default title" />
  <link rel="canonical" href="https://old.example/" />
  <script type="application/ld+json">{"@type":"WebSite"}</script>
</head>
<body><div id="root"></div></body>
</html>`

const product = {
  id: 'prod-1',
  name: 'Desk "Lamp" <Pro>',
  slug: 'desk-lamp',
  short_description: 'A desk lamp.',
  description: '',
  price: '20.00',
  currency: 'USD',
  discount_price: null,
  thumbnail: '/media/desk-lamp.jpg',
  average_rating: '4.0',
  review_count: 3,
  category: { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
} as unknown as PublicProductDetail

describe('renderSeoHead', () => {
  it('serves the homepage without the buying guide', () => {
    const html = renderSeoHead(SHELL, getStaticPageSeo('/')!, { origin: 'https://shop.example', path: '/' })
    const body = html.slice(html.indexOf('<body>'))
    expect(body.match(/<h1\b/g)).toHaveLength(1)
    expect(body).toContain(escapeHtml(HOME_HEADING))
    expect(body).not.toContain('home-buying-guide')
    expect(body).not.toContain('Questions about buying 3D assets')
  })
  it('includes readable content and crawlable links without requiring JavaScript', () => {
    const html = renderSeoHead(SHELL, getStaticPageSeo('/about')!, { origin: 'https://shop.example', path: '/about' })
    const body = html.slice(html.indexOf('<body>'))
    expect(body).toContain('<h1 id="page-summary-title">About the Studio | AssetHive3D</h1>')
    expect(body).toContain('About AssetHive3D: a marketplace')
    expect(body).toContain('<a href="/3d-models">3D models</a>')
    expect(body).toContain('<a href="/custom-projects">Custom 3D projects</a>')
  })

  it('escapes page content and preserves any existing app markup in the root', () => {
    const seo = { ...getStaticPageSeo('/about')!, title: '<script>alert(1)</script>', description: 'A & B' }
    const html = renderSeoHead(SHELL, seo, { origin: 'https://shop.example', path: '/about' })
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;</h1>')
    expect(html).toContain('<p>A &amp; B</p>')
    const populated = SHELL.replace('<div id="root"></div>', '<div id="root"><main>Existing content</main></div>')
    const result = renderSeoHead(populated, seo, { origin: 'https://shop.example', path: '/about' })
    expect(result).toContain('<div id="root"><main>Existing content</main></div>')
    expect(result).not.toContain('id="page-summary-title"')
  })
  it('removes stale default image attributes for a product thumbnail', () => {
    const html = renderSeoHead(SHELL.replace('</head>', '<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" /><meta property="og:image:alt" content="Default furniture" /></head>'), getProductPageSeo(product, 'https://shop.example'), { origin: 'https://shop.example', path: '/products/desk-lamp' })
    expect(html).not.toContain('og:image:width')
    expect(html).not.toContain('og:image:height')
    expect(html).not.toContain('Default furniture')
    expect(html.match(/property="og:image:alt"/g)).toHaveLength(1)
    expect(html).toContain('property="og:image:alt" content="Desk &quot;Lamp&quot; &lt;Pro&gt;"')
  })
  it('replaces the shell tags with the page tags', () => {
    const html = renderSeoHead(SHELL, getStaticPageSeo('/about')!, {
      origin: 'https://shop.example',
      path: '/about',
    })

    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html.match(/name="description"/g)).toHaveLength(1)
    expect(html.match(/property="og:title"/g)).toHaveLength(1)
    expect(html.match(/rel="canonical"/g)).toHaveLength(1)
    expect(html).toContain('<title>About the Studio | AssetHive3D</title>')
    expect(html).toContain('href="https://shop.example/about"')
    expect(html).not.toContain('Default description')
    expect(html).not.toContain('old.example')
  })

  it('keeps unrelated head tags such as the charset and the site-wide schema', () => {
    const html = renderSeoHead(SHELL, getStaticPageSeo('/')!, {
      origin: 'https://shop.example',
      path: '/',
    })

    expect(html).toContain('<meta charset="UTF-8" />')
    expect(html).toContain('{"@type":"WebSite"}')
    expect(html).toContain('<div id="root"><main')
  })

  it('escapes product names inside attributes and the title', () => {
    const seo = getProductPageSeo(product, 'https://shop.example')
    const html = renderSeoHead(SHELL, seo, {
      origin: 'https://shop.example',
      path: '/products/desk-lamp',
    })

    expect(html).toContain('Desk &quot;Lamp&quot; &lt;Pro&gt; – Furniture 3D Model | AssetHive3D')
    expect(html).not.toContain('<Pro>')
  })

  it('adds product structured data with the canonical url and no raw "<"', () => {
    const seo = getProductPageSeo(
      { ...product, name: 'Lamp </script><script>alert(1)</script>' },
      'https://shop.example',
    )
    const html = renderSeoHead(SHELL, seo, {
      origin: 'https://shop.example',
      path: '/products/desk-lamp',
    })

    const match = html.match(
      /<script type="application\/ld\+json" id="seo-structured-data" data-seo-ssr>([\s\S]*?)<\/script>/,
    )
    expect(match).not.toBeNull()
    const data = JSON.parse(match![1])
    expect(data['@type']).toBe('Product')
    expect(data.url).toBe('https://shop.example/products/desk-lamp')
    expect(data.name).toBe('Lamp </script><script>alert(1)</script>')
    expect(html).not.toContain('</script><script>alert')
  })

  it('uses an absolute image URL for product thumbnails', () => {
    const seo = getProductPageSeo(product, 'https://shop.example')

    expect(seo.image).toBe('https://shop.example/media/desk-lamp.jpg')
  })

  it('returns the shell unchanged when it has no closing head tag', () => {
    expect(
      renderSeoHead('not a document', getStaticPageSeo('/')!, {
        origin: 'https://shop.example',
        path: '/',
      }),
    ).toBe('not a document')
  })

  it('marks not-found pages with status 404', () => {
    expect(getNotFoundPageSeo('Product')).toMatchObject({
      status: 404,
      title: 'Product not found | AssetHive3D',
    })
  })
})

describe('path helpers', () => {
  it('normalizes trailing slashes but keeps the root', () => {
    expect(normalizePath('/plugins/uv-tools/')).toBe('/plugins/uv-tools')
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('///')).toBe('/')
  })

  it('treats paths with a file extension as assets', () => {
    expect(isLikelyAssetPath('/assets/index-abc.js')).toBe(true)
    expect(isLikelyAssetPath('/products/desk-lamp')).toBe(false)
  })

  it('has no head content for unknown static paths', () => {
    expect(getStaticPageSeo('/cart')).toBeUndefined()
    expect(getStaticPageSeo('constructor')).toBeUndefined()
  })
})

describe('sitemap and robots', () => {
  it('adds a Sitemap line to robots.txt once', () => {
    const robots = appendSitemapLine('User-agent: *\nAllow: /\n', 'https://shop.example')

    expect(robots).toContain('Sitemap: https://shop.example/sitemap.xml')
    expect(appendSitemapLine(robots, 'https://shop.example').match(/Sitemap:/g)).toHaveLength(1)
  })

  it('escapes HTML-significant characters', () => {
    expect(escapeHtml(`a & b <c> "d" 'e'`)).toBe('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;')
  })
})
