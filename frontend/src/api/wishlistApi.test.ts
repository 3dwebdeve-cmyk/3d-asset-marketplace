import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WishlistItem } from '../types/wishlist'
import { apiClient } from './client'
import { addWishlistItem, listWishlistItems, removeWishlistItem } from './wishlistApi'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

const itemId = '11111111-1111-1111-1111-111111111111'
const productId = '22222222-2222-2222-2222-222222222222'

const wishlistItem: WishlistItem = {
  id: itemId,
  product_type: 'product',
  product_id: productId,
  catalog: {
    name: 'Oak Chair',
    slug: 'oak-chair',
    short_description: 'A wooden chair',
    thumbnail: 'https://example.com/chair.png',
    price: '29.99',
    discount_price: null,
    currency: 'USD',
    license_type: 'standard',
    average_rating: '4.50',
    category: { id: '33333333-3333-3333-3333-333333333333', name: 'Furniture', slug: 'furniture' },
    is_available: true,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('wishlistApi', () => {
  it('lists wishlist items with default params', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })

    await listWishlistItems()

    expect(apiClient.get).toHaveBeenCalledWith('/api/wishlist/')
  })

  it('lists wishlist items with pagination and filters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { count: 1, next: null, previous: null, results: [wishlistItem] },
    })

    await listWishlistItems({
      page: 2,
      page_size: 10,
      product_type: 'plugin',
      ordering: '-created_at',
    })

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/wishlist/?page=2&page_size=10&product_type=plugin&ordering=-created_at',
    )
  })

  it('adds a wishlist item', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: wishlistItem })

    const result = await addWishlistItem({
      product_type: 'product',
      product_id: productId,
    })

    expect(apiClient.post).toHaveBeenCalledWith('/api/wishlist/', {
      product_type: 'product',
      product_id: productId,
    })
    expect(result.id).toBe(itemId)
  })

  it('removes a wishlist item', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined })

    await removeWishlistItem(itemId)

    expect(apiClient.delete).toHaveBeenCalledWith(`/api/wishlist/${itemId}/`)
  })
})
