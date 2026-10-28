import { describe, expect, it } from 'vitest'

import {
  buildCollectionStructuredData,
  buildPluginStructuredData,
  buildProductStructuredData,
  SITE_NAME,
} from './seo'

const baseProduct = {
  id: 'prod-1',
  name: 'Office Chair',
  short_description: 'A swivel office chair.',
  thumbnail: 'https://cdn.example.com/chair.jpg',
  price: '20.00',
  currency: 'USD',
  discount_price: null,
  average_rating: '4.5',
  review_count: 12,
  category: { name: 'Furniture' },
}

describe('buildProductStructuredData', () => {
  it('describes the product with its offer and rating', () => {
    expect(buildProductStructuredData(baseProduct)).toEqual({
      '@type': 'Product',
      name: 'Office Chair',
      description: 'A swivel office chair.',
      image: 'https://cdn.example.com/chair.jpg',
      sku: 'prod-1',
      category: 'Furniture',
      brand: { '@type': 'Brand', name: SITE_NAME },
      offers: {
        '@type': 'Offer',
        price: '20.00',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 12 },
    })
  })

  it('uses the discounted price when one is set', () => {
    const data = buildProductStructuredData({ ...baseProduct, discount_price: '15.00' })

    expect(data.offers.price).toBe('15.00')
  })

  it('omits the rating when the product has no reviews', () => {
    const data = buildProductStructuredData({ ...baseProduct, review_count: 0 })

    expect(data.aggregateRating).toBeUndefined()
  })

  it('falls back to the product name when there is no short description', () => {
    const data = buildProductStructuredData({ ...baseProduct, short_description: '' })

    expect(data.description).toBe('Office Chair')
  })
})

describe('buildPluginStructuredData', () => {
  it('describes the plugin as a design software application', () => {
    const data = buildPluginStructuredData({
      name: 'UV Unwrap Pro',
      short_description: 'Fast UV unwrapping.',
      thumbnail: '',
      version: '2.1',
      price: '0.00',
      currency: 'USD',
      discount_price: null,
      average_rating: '0',
      review_count: 0,
    })

    expect(data['@type']).toBe('SoftwareApplication')
    expect(data.applicationCategory).toBe('DesignApplication')
    expect(data.softwareVersion).toBe('2.1')
    expect(data.image).toBeUndefined()
    expect(data.aggregateRating).toBeUndefined()
  })
})

describe('buildCollectionStructuredData', () => {
  it('returns a CollectionPage with the given name and description', () => {
    expect(buildCollectionStructuredData('3D Models', 'Browse models.')).toEqual({
      '@type': 'CollectionPage',
      name: '3D Models',
      description: 'Browse models.',
    })
  })
})
