import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as cartApi from '../../api/cartApi'
import * as paymentsApi from '../../api/paymentsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore, testUser } from '../../test/test-utils'
import { useAuthStore } from '../../store/authStore'
import { CartPage } from './CartPage'
import { Toaster } from '../../components/ui/Toaster'

vi.mock('../../api/cartApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/cartApi')>('../../api/cartApi')
  return {
    ...actual,
    getCart: vi.fn(),
    updateCartItemQuantity: vi.fn(),
    removeCartItem: vi.fn(),
    clearCart: vi.fn(),
    applyCartCoupon: vi.fn(),
    removeCartCoupon: vi.fn(),
  }
})

vi.mock('../../api/paymentsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/paymentsApi')>(
    '../../api/paymentsApi',
  )
  return {
    ...actual,
    createCheckoutSession: vi.fn(),
  }
})

const itemId = '11111111-1111-1111-1111-111111111111'
const productId = '22222222-2222-2222-2222-222222222222'

const sampleCart = {
  id: 'cart-id',
  currency: 'USD',
  subtotal: '59.98',
  discount_amount: '0.00',
  total: '59.98',
  item_count: 1,
  total_quantity: 2,
  coupon: null,
  items: [
    {
      id: itemId,
      product_type: 'product' as const,
      product_id: productId,
      quantity: 2,
      unit_price: '29.99',
      line_total: '59.98',
      catalog: {
        name: 'Oak Chair',
        slug: 'oak-chair',
        thumbnail: 'https://example.com/chair.png',
        price: '29.99',
        discount_price: null,
        effective_price: '29.99',
        currency: 'USD',
        category: { id: 'cat-id', name: 'Furniture', slug: 'furniture' },
        is_available: true,
      },
    },
  ],
}

function renderCartPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CartPage />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetAuthStore()
  resetToastStore()
  useAuthStore.setState({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: testUser,
    isAuthenticated: true,
    postLogoutRedirect: null,
  })
  vi.mocked(cartApi.getCart).mockResolvedValue(sampleCart)
})

describe('CartPage', () => {
  it('renders cart line items, subtotal, total, and an enabled checkout button', async () => {
    renderCartPage()

    expect(await screen.findByRole('link', { name: /oak chair/i })).toHaveAttribute(
      'href',
      '/products/oak-chair',
    )
    expect(screen.getByText('Product')).toBeInTheDocument()
    expect(screen.getAllByText('$59.98').length).toBeGreaterThan(0)
    expect(screen.getByLabelText(/coupon code/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^checkout$/i })).toBeEnabled()
  })

  it('starts checkout and redirects to the returned checkout URL', async () => {
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
    })

    const user = userEvent.setup()
    vi.mocked(paymentsApi.createCheckoutSession).mockResolvedValue({
      checkout_url: 'https://checkout.stripe.com/pay/cs_test_123',
      order_id: 'order-id',
    })

    renderCartPage()
    await screen.findByRole('link', { name: /oak chair/i })

    await user.click(screen.getByRole('button', { name: /^checkout$/i }))

    await waitFor(() => {
      expect(paymentsApi.createCheckoutSession).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(window.location.href).toBe('https://checkout.stripe.com/pay/cs_test_123')
    })

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('applies a coupon code', async () => {
    const user = userEvent.setup()
    vi.mocked(cartApi.applyCartCoupon).mockResolvedValue({
      ...sampleCart,
      discount_amount: '6.00',
      total: '53.98',
      coupon: {
        code: 'SAVE10',
        discount_type: 'percent',
        discount_value: '10.00',
      },
    })

    renderCartPage()
    await screen.findByRole('link', { name: /oak chair/i })

    await user.type(screen.getByLabelText(/coupon code/i), 'SAVE10')
    await user.click(screen.getByRole('button', { name: /^apply$/i }))

    await waitFor(() => {
      expect(vi.mocked(cartApi.applyCartCoupon).mock.calls[0]?.[0]).toEqual({
        code: 'SAVE10',
      })
    })
    expect(await screen.findByRole('button', { name: /remove coupon/i })).toBeInTheDocument()
    expect(screen.getByText('SAVE10')).toBeInTheDocument()
    expect(screen.getByText('−$6.00')).toBeInTheDocument()
    expect(screen.getByText('$53.98')).toBeInTheDocument()
  })

  it('shows empty state when cart has no items', async () => {
    vi.mocked(cartApi.getCart).mockResolvedValue({
      id: 'cart-id',
      currency: 'USD',
      subtotal: '0.00',
      discount_amount: '0.00',
      total: '0.00',
      item_count: 0,
      total_quantity: 0,
      coupon: null,
      items: [],
    })

    renderCartPage()

    expect(await screen.findByText(/your cart is empty/i)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /browse models/i })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: /browse plugins/i })).toHaveLength(1)
  })

  it('removes an item when remove is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(cartApi.removeCartItem).mockResolvedValue(undefined)

    renderCartPage()
    await screen.findByRole('link', { name: /oak chair/i })

    await user.click(screen.getByRole('button', { name: /^remove$/i }))

    await waitFor(() => {
      expect(vi.mocked(cartApi.removeCartItem).mock.calls[0]?.[0]).toBe(itemId)
    })
  })

  it('increases quantity via stepper', async () => {
    const user = userEvent.setup()
    vi.mocked(cartApi.updateCartItemQuantity).mockResolvedValue({
      ...sampleCart.items[0],
      quantity: 3,
      line_total: '89.97',
    })

    renderCartPage()
    await screen.findByRole('link', { name: /oak chair/i })

    await user.click(screen.getByRole('button', { name: /increase quantity/i }))

    await waitFor(() => {
      expect(vi.mocked(cartApi.updateCartItemQuantity).mock.calls[0]?.[0]).toBe(itemId)
      expect(vi.mocked(cartApi.updateCartItemQuantity).mock.calls[0]?.[1]).toEqual({
        quantity: 3,
      })
    })
  })
})
