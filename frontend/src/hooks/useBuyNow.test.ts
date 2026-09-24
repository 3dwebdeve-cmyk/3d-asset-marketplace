import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as cartApi from '../api/cartApi'
import * as paymentsApi from '../api/paymentsApi'
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
  items: [],
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useBuyNow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(cartApi.getCart).mockResolvedValue(emptyCart)
    vi.mocked(cartApi.addCartItem).mockResolvedValue({
      id: 'item-id',
      product_type: 'product',
      product_id: 'prod-1',
      quantity: 1,
      unit_price: '10.00',
      line_total: '10.00',
      catalog: null,
    })
    vi.mocked(paymentsApi.createCheckoutSession).mockResolvedValue({
      checkout_url: 'https://checkout.stripe.com/pay/cs_test_buy_now',
      order_id: 'order-id',
    })
  })

  it('adds the item then redirects to Stripe checkout', async () => {
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
    })

    const { result } = renderHook(() => useBuyNow(), { wrapper: createWrapper() })

    act(() => {
      result.current.buyNow('product', 'prod-1')
    })

    await waitFor(() => {
      expect(cartApi.addCartItem).toHaveBeenCalledWith({
        product_type: 'product',
        product_id: 'prod-1',
        quantity: 1,
      })
      expect(paymentsApi.createCheckoutSession).toHaveBeenCalledTimes(1)
      expect(window.location.href).toBe('https://checkout.stripe.com/pay/cs_test_buy_now')
    })

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('skips add when the item is already in the cart', async () => {
    vi.mocked(cartApi.getCart).mockResolvedValue({
      ...emptyCart,
      item_count: 1,
      total_quantity: 1,
      subtotal: '10.00',
      total: '10.00',
      items: [
        {
          id: 'item-id',
          product_type: 'product',
          product_id: 'prod-1',
          quantity: 1,
          unit_price: '10.00',
          line_total: '10.00',
          catalog: null,
        },
      ],
    })

    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
    })

    const { result } = renderHook(() => useBuyNow(), { wrapper: createWrapper() })

    act(() => {
      result.current.buyNow('product', 'prod-1')
    })

    await waitFor(() => {
      expect(cartApi.addCartItem).not.toHaveBeenCalled()
      expect(paymentsApi.createCheckoutSession).toHaveBeenCalledTimes(1)
      expect(window.location.href).toBe('https://checkout.stripe.com/pay/cs_test_buy_now')
    })

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })
})
