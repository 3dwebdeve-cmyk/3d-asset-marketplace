import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Cart, CartItem } from '../types/cart'
import { apiClient } from './client'
import {
  addCartItem,
  applyCartCoupon,
  clearCart,
  getCart,
  removeCartCoupon,
  removeCartItem,
  updateCartItemQuantity,
} from './cartApi'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const itemId = '11111111-1111-1111-1111-111111111111'
const productId = '22222222-2222-2222-2222-222222222222'
const cartId = '33333333-3333-3333-3333-333333333333'

const cartItem: CartItem = {
  id: itemId,
  product_type: 'product',
  product_id: productId,
  quantity: 1,
  unit_price: '29.99',
  line_total: '29.99',
  catalog: {
    name: 'Oak Chair',
    slug: 'oak-chair',
    thumbnail: 'https://example.com/chair.png',
    price: '29.99',
    discount_price: null,
    effective_price: '29.99',
    currency: 'USD',
    category: { id: '44444444-4444-4444-4444-444444444444', name: 'Furniture', slug: 'furniture' },
    is_available: true,
  },
}

const cart: Cart = {
  id: cartId,
  currency: 'USD',
  subtotal: '29.99',
  discount_amount: '0.00',
  total: '29.99',
  item_count: 1,
  total_quantity: 1,
  coupon: null,
  items: [cartItem],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('cartApi', () => {
  it('gets the cart', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: cart })

    const result = await getCart()

    expect(apiClient.get).toHaveBeenCalledWith('/api/cart/')
    expect(result.id).toBe(cartId)
  })

  it('adds a cart item', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: cartItem })

    const result = await addCartItem({
      product_type: 'product',
      product_id: productId,
    })

    expect(apiClient.post).toHaveBeenCalledWith('/api/cart/', {
      product_type: 'product',
      product_id: productId,
    })
    expect(result.id).toBe(itemId)
  })

  it('updates cart item quantity', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { ...cartItem, quantity: 3, line_total: '89.97' },
    })

    const result = await updateCartItemQuantity(itemId, { quantity: 3 })

    expect(apiClient.patch).toHaveBeenCalledWith(`/api/cart/items/${itemId}/`, {
      quantity: 3,
    })
    expect(result.quantity).toBe(3)
  })

  it('removes a cart item', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined })

    await removeCartItem(itemId)

    expect(apiClient.delete).toHaveBeenCalledWith(`/api/cart/items/${itemId}/`)
  })

  it('clears the cart', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: undefined })

    await clearCart()

    expect(apiClient.delete).toHaveBeenCalledWith('/api/cart/')
  })

  it('applies a coupon', async () => {
    const discounted = {
      ...cart,
      discount_amount: '3.00',
      total: '26.99',
      coupon: {
        code: 'SAVE10',
        discount_type: 'percent' as const,
        discount_value: '10.00',
      },
    }
    vi.mocked(apiClient.post).mockResolvedValue({ data: discounted })

    const result = await applyCartCoupon({ code: 'SAVE10' })

    expect(apiClient.post).toHaveBeenCalledWith('/api/cart/coupon/', { code: 'SAVE10' })
    expect(result.coupon?.code).toBe('SAVE10')
  })

  it('removes a coupon', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: cart })

    const result = await removeCartCoupon()

    expect(apiClient.delete).toHaveBeenCalledWith('/api/cart/coupon/')
    expect(result.coupon).toBeNull()
  })
})
