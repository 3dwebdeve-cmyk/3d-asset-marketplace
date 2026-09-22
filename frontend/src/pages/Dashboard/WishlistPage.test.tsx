import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as cartApi from '../../api/cartApi'
import * as wishlistApi from '../../api/wishlistApi'
import {
  createTestQueryClient,
  resetAuthStore,
  testUser,
} from '../../test/test-utils'
import { useAuthStore } from '../../store/authStore'
import type { WishlistItem } from '../../types/wishlist'
import { WishlistPage } from './WishlistPage'

vi.mock('../../api/wishlistApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/wishlistApi')>(
    '../../api/wishlistApi',
  )
  return {
    ...actual,
    listWishlistItems: vi.fn(),
    removeWishlistItem: vi.fn(),
  }
})

vi.mock('../../api/cartApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/cartApi')>(
    '../../api/cartApi',
  )
  return {
    ...actual,
    getCart: vi.fn(),
    addCartItem: vi.fn(),
  }
})

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
    thumbnail: '',
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

function renderWishlistPage() {
  const queryClient = createTestQueryClient()
  useAuthStore.setState({
    accessToken: 'test-access-token',
    user: testUser,
    isAuthenticated: true,
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WishlistPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetAuthStore()
  vi.mocked(wishlistApi.listWishlistItems).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [wishlistItem],
  })
  vi.mocked(wishlistApi.removeWishlistItem).mockResolvedValue(undefined)
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
})

describe('WishlistPage', () => {
  it('shows loading state initially', () => {
    vi.mocked(wishlistApi.listWishlistItems).mockImplementation(
      () => new Promise(() => undefined),
    )
    renderWishlistPage()
    expect(screen.getByRole('status')).toHaveTextContent(/loading your wishlist/i)
  })

  it('renders saved wishlist items with design actions', async () => {
    renderWishlistPage()
    expect(await screen.findByRole('link', { name: 'Oak Chair' })).toHaveAttribute(
      'href',
      '/products/oak-chair',
    )
    expect(screen.getByRole('button', { name: /add oak chair to cart/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /remove oak chair from wishlist/i }),
    ).toBeInTheDocument()
  })

  it('shows empty state when the wishlist has no items', async () => {
    vi.mocked(wishlistApi.listWishlistItems).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    renderWishlistPage()

    expect(
      await screen.findByText(/your wishlist is empty/i),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /browse models/i })[0]).toHaveAttribute(
      'href',
      '/3d-models',
    )
  })

  it('shows error state and retries', async () => {
    const user = userEvent.setup()
    vi.mocked(wishlistApi.listWishlistItems)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        count: 1,
        next: null,
        previous: null,
        results: [wishlistItem],
      })

    renderWishlistPage()

    expect(
      await screen.findByRole('heading', { name: /could not load your wishlist/i }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByRole('link', { name: /oak chair/i })).toBeInTheDocument()
  })

  it('removes an item from the wishlist via the heart control', async () => {
    const user = userEvent.setup()
    renderWishlistPage()

    await screen.findByRole('link', { name: /oak chair/i })
    await user.click(
      screen.getByRole('button', { name: /remove oak chair from wishlist/i }),
    )

    await waitFor(() => {
      expect(wishlistApi.removeWishlistItem).toHaveBeenCalled()
    })
    expect(vi.mocked(wishlistApi.removeWishlistItem).mock.calls[0]?.[0]).toBe(itemId)
  })
})
