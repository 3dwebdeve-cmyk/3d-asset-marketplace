import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as cartApi from '../api/cartApi'
import * as paymentsApi from '../api/paymentsApi'
import type { CartItem } from '../types/cart'
import { useBuyNow } from './useBuyNow'

vi.mock('../api/cartApi', async () => {
  const actual = await vi.importActual<typeof import('../api/cartApi')>('../api/cartApi')
  return {
    ...actual,
    getCart: vi.fn(),
    addCartItem: vi.fn(),
  }
})

vi.mock('../api/paymentsApi', async () => {
  const actual = await vi.importActual<typeof import('../api/paymentsApi')>(
    '../api/paymentsApi',
  )
  return {
    ...actual,
    createCheckoutSession: vi.fn(),
  }
})

vi.mock('../lib/toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const emptyCart = {
  id: 'cart-id',
  currency: 'USD',
  subtotal: '0.00',
  discount_amount: '0.00',
  total: '0.00',
  item_count: 0,
  total_quantity: 0,
  items: [] as CartItem[],
}

function cartLine(overrides: Partial<CartItem>): CartItem {
  return {
    id: 'item-id',
    product_type: 'product',
    product_id: 'prod-1',
    package_kind: 'whole',
    quantity: 1,
    unit_price: '10.00',
    line_total: '10.00',
    catalog: null,
    ...overrides,
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const originalLocation = window.location

describe('useBuyNow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(cartApi.getCart).mockResolvedValue(emptyCart)
    vi.mocked(cartApi.addCartItem).mockResolvedValue(cartLine({}))
    vi.mocked(paymentsApi.createCheckoutSession).mockResolvedValue({
      checkout_url: 'https://checkout.stripe.com/pay/cs_test_buy_now',
      order_id: 'order-id',
    })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('adds one line per package, then pays for those lines only', async () => {
    const { result } = renderHook(() => useBuyNow(), { wrapper: createWrapper() })

    act(() => {
      result.current.buyNow('product', 'prod-1', ['with_light_rig', 'whole'])
    })

    await waitFor(() => {
      expect(window.location.href).toBe('https://checkout.stripe.com/pay/cs_test_buy_now')
    })
    expect(cartApi.addCartItem).toHaveBeenCalledTimes(2)
    expect(cartApi.addCartItem).toHaveBeenCalledWith({
      product_type: 'product',
      product_id: 'prod-1',
      package_kind: 'with_light_rig',
      quantity: 1,
    })
    expect(cartApi.addCartItem).toHaveBeenCalledWith({
      product_type: 'product',
      product_id: 'prod-1',
      package_kind: 'whole',
      quantity: 1,
    })
    expect(paymentsApi.createCheckoutSession).toHaveBeenCalledWith(expect.anything(), [
      { product_type: 'product', product_id: 'prod-1', package_kind: 'with_light_rig' },
      { product_type: 'product', product_id: 'prod-1', package_kind: 'whole' },
    ])
  })

  it('skips a package already in the cart, but not another package of the model', async () => {
    vi.mocked(cartApi.getCart).mockResolvedValue({
      ...emptyCart,
      item_count: 1,
      total_quantity: 1,
      items: [cartLine({ package_kind: 'whole' })],
    })
    const { result } = renderHook(() => useBuyNow(), { wrapper: createWrapper() })

    act(() => {
      result.current.buyNow('product', 'prod-1', ['glb_only', 'whole'])
    })

    await waitFor(() => {
      expect(paymentsApi.createCheckoutSession).toHaveBeenCalledTimes(1)
    })
    expect(cartApi.addCartItem).toHaveBeenCalledTimes(1)
    expect(cartApi.addCartItem).toHaveBeenCalledWith({
      product_type: 'product',
      product_id: 'prod-1',
      package_kind: 'glb_only',
      quantity: 1,
    })
  })

  it('buys a plugin as one line with no package', async () => {
    const { result } = renderHook(() => useBuyNow(), { wrapper: createWrapper() })

    act(() => {
      result.current.buyNow('plugin', 'plugin-1')
    })

    await waitFor(() => {
      expect(paymentsApi.createCheckoutSession).toHaveBeenCalledWith(expect.anything(), [
        { product_type: 'plugin', product_id: 'plugin-1' },
      ])
    })
    expect(cartApi.addCartItem).toHaveBeenCalledWith({
      product_type: 'plugin',
      product_id: 'plugin-1',
      quantity: 1,
    })
  })
})
