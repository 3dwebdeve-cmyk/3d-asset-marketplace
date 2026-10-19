import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PublicProductDetail } from '../types/product'
import {
  HOME_DESCRIPTION,
  HOME_TITLE,
  absoluteUrl,
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
  buildOrganizationJsonLd,
  buildPageTitle,
  buildProductDescription,
  buildProductJsonLd,
  buildProductTitle,
  getSiteUrl,
  plainText,
  truncateText,
} from './seo'

afterEach(() => {
  vi.unstubAllEnvs()
})

const product: PublicProductDetail = {
  id: 'p1',
  name: 'Oak Dining Chair',
  slug: 'oak-dining-chair',
  description: '<p>Solid oak <strong>dining</strong> chair.</p>',
  short_description: '',
  price: '29.99',
  currency: 'USD',
  discount_price: '19.99',
  thumbnail: '/thumb.jpg',
  preview_model: '',
  preview_video: '',
  polygon_count: 12000,
  vertex_count: 8000,
  software_used: 'Blender',
  animated: false,
  rigged: false,
  pbr_ready: true,
  game_ready: true,
  license_type: 'standard',
  average_rating: '4.50',
  review_count: 8,
  total_downloads: 0,
  category: { id: 'c1', name: 'Furniture', slug: 'furniture' },
  images: [
    { id: 'i1', image_url: '/thumb.jpg', display_order: 0, is_primary: true, created_at: '' },
    { id: 'i2', image_url: 'https://cdn.example.com/b.jpg', display_order: 1, is_primary: false, created_at: '' },
  ],
  files: [],
  created_at: '',
  updated_at: '',
}

describe('site address', () => {
  it('uses VITE_SITE_URL when it is set, without a trailing slash', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://assethive3d.com/')
    expect(getSiteUrl()).toBe('https://assethive3d.com')
    expect(absoluteUrl('/3d-models/furniture')).toBe('https://assethive3d.com/3d-models/furniture')
    expect(absoluteUrl('3d-models')).toBe('https://assethive3d.com/3d-models')
  })

  it('falls back to the address the page is served from', () => {
    vi.stubEnv('VITE_SITE_URL', '')
    expect(getSiteUrl()).toBe(window.location.origin)
  })

  it('leaves a full address untouched', () => {
    expect(absoluteUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg')
  })
})

describe('text helpers', () => {
  it('cuts at a word boundary and marks the cut', () => {
    const cut = truncateText('Furniture models for interior design and visualization scenes', 30)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut.length).toBeLessThanOrEqual(30)
    expect(cut).not.toMatch(/\s…$/)
    expect('Furniture models for interior design and visualization scenes').toContain(cut.slice(0, -1))
  })

  it('leaves short text alone and collapses spacing', () => {
    expect(truncateText('  a   short   line ', 50)).toBe('a short line')
  })

  it('strips markup from descriptions', () => {
    expect(plainText('<p>Solid <b>oak</b> chair</p>')).toBe('Solid oak chair')
  })
})

describe('titles', () => {
  it('keeps the home title and description inside what search results show', () => {
    expect(HOME_TITLE).toBe('Furniture & Interior 3D Models | AssetHive3D')
    expect(HOME_TITLE.length).toBeLessThanOrEqual(60)
    expect(HOME_DESCRIPTION.length).toBeLessThanOrEqual(160)
  })

  it('adds the brand and never runs far past a result-friendly length', () => {
    expect(buildPageTitle('About the Studio')).toBe('About the Studio | AssetHive3D')
    expect(buildPageTitle('x'.repeat(200)).length).toBeLessThanOrEqual(66)
    expect(buildPageTitle('x'.repeat(200)).endsWith('| AssetHive3D')).toBe(true)
  })

  it('puts the category in a product title only when it still fits', () => {
    expect(buildProductTitle('Oak Chair', 'Furniture')).toBe('Oak Chair – Furniture 3D Model | AssetHive3D')
    const long = buildProductTitle('A very long product name that keeps going and going', 'Furniture')
    expect(long.length).toBeLessThanOrEqual(66)
    expect(long.endsWith('3D Model | AssetHive3D')).toBe(true)
    expect(buildProductTitle('Oak Chair')).toBe('Oak Chair 3D Model | AssetHive3D')
  })
})

describe('product description', () => {
  it('uses a hand-written short description exactly, trimmed to a snippet', () => {
    expect(buildProductDescription('Oak Chair', '  A solid oak chair.  ')).toBe('A solid oak chair.')
    expect(buildProductDescription('Oak Chair', 'word '.repeat(80)).length).toBeLessThanOrEqual(160)
  })

  it('builds one only from facts it was given', () => {
    expect(
      buildProductDescription('Oak Chair', '', { categoryName: 'Furniture', polygonCount: 12000, licenseType: 'standard' }),
    ).toBe(
      'Oak Chair: Furniture 3D model, 12,000 polygons. Preview in 3D, secure checkout and instant download. Standard license.',
    )
    // No polygon count, category or license: those parts are left out, not guessed.
    expect(buildProductDescription('Oak Chair', '')).toBe(
      'Oak Chair: 3D model. Preview in 3D, secure checkout and instant download.',
    )
  })
})

describe('structured data', () => {
  it('describes a product with its real sale price, currency, images and rating', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://assethive3d.com')
    const data = buildProductJsonLd(product, '/products/oak-dining-chair') as Record<string, any>

    expect(data['@type']).toBe('Product')
    expect(data.url).toBe('https://assethive3d.com/products/oak-dining-chair')
    expect(data.offers).toEqual({
      '@type': 'Offer',
      url: 'https://assethive3d.com/products/oak-dining-chair',
      priceCurrency: 'USD',
      price: '19.99',
      availability: 'https://schema.org/InStock',
    })
    expect(data.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 8 })
    // Images are full addresses, and the repeated thumbnail appears once.
    expect(data.image).toEqual(['https://assethive3d.com/thumb.jpg', 'https://cdn.example.com/b.jpg'])
    // The description is plain text taken from the page's own copy.
    expect(data.description).toBe('Solid oak dining chair.')
  })

  it('leaves out the rating when nobody has reviewed the product', () => {
    const data = buildProductJsonLd({ ...product, review_count: 0, average_rating: '0.00' }, '/products/x')
    expect(data).not.toHaveProperty('aggregateRating')
  })

  it('numbers breadcrumbs from one and uses full addresses', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://assethive3d.com')
    const data = buildBreadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: '3D Models', path: '/3d-models' },
    ]) as Record<string, any>
    expect(data.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://assethive3d.com/' },
      { '@type': 'ListItem', position: 2, name: '3D Models', item: 'https://assethive3d.com/3d-models' },
    ])
  })

  it('lists items and names the organisation with its logo', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://assethive3d.com')
    const list = buildItemListJsonLd('Furniture 3D Models', [{ name: 'Oak Chair', path: '/products/oak-chair' }]) as Record<string, any>
    expect(list.itemListElement[0]).toMatchObject({ position: 1, url: 'https://assethive3d.com/products/oak-chair' })
    expect(buildOrganizationJsonLd()).toMatchObject({
      '@type': 'Organization',
      name: 'AssetHive3D',
      logo: 'https://assethive3d.com/images/AssetHive%203D.svg',
    })
  })
})
