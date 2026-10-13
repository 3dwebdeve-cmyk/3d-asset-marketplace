import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as pluginsApi from '../../api/pluginsApi'
import * as cartApi from '../../api/cartApi'
import * as paymentsApi from '../../api/paymentsApi'
import * as wishlistApi from '../../api/wishlistApi'
import * as reviewsApi from '../../api/reviewsApi'
import {
  createTestQueryClient,
  resetAuthStore,
  resetToastStore,
  testUser,
} from '../../test/test-utils'
import { useAuthStore } from '../../store/authStore'
import type { PublicPluginDetail } from '../../types/plugin'
import { PluginDetailsPage } from './PluginDetailsPage'
import { Toaster } from '../../components/ui/Toaster'

vi.mock('../../api/pluginsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/pluginsApi')>(
    '../../api/pluginsApi',
  )
  return {
    ...actual,
    getPublicPlugin: vi.fn(),
    listPublicPlugins: vi.fn(),
  }
})

vi.mock('../../api/cartApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/cartApi')>('../../api/cartApi')
  return {
    ...actual,
    getCart: vi.fn(),
    addCartItem: vi.fn(),
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

vi.mock('../../api/wishlistApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/wishlistApi')>(
    '../../api/wishlistApi',
  )
  return {
    ...actual,
    listWishlistItems: vi.fn(),
    addWishlistItem: vi.fn(),
    removeWishlistItem: vi.fn(),
  }
})

vi.mock('../../api/reviewsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/reviewsApi')>(
    '../../api/reviewsApi',
  )
  return {
    ...actual,
    listReviews: vi.fn(),
    getReviewEligibility: vi.fn(),
    createReview: vi.fn(),
  }
})

const categoryId = '55ccb318-9b1d-4a0e-bcef-6b494fe3222c'
const pluginId = 'd4e77f31-f244-5617-b7d6-b58e3ff6de22'
const relatedPluginId = 'e5f88a42-a355-6728-c8e7-c69f4aa7ef33'

const sampleDetail: PublicPluginDetail = {
  id: pluginId,
  name: 'UV Unwrap Pro',
  slug: 'uv-unwrap-pro',
  description: 'An advanced UV unwrapping plugin for Blender and 3ds Max.',
  short_description: 'One-click UV unwrapping for 3D artists',
  price: '29.99',
  currency: 'USD',
  discount_price: '19.99',
  thumbnail: 'https://cdn.example.com/plugin-thumb.jpg',
  version: '2.1.0',
  compatibility: 'Blender 3.x, 3ds Max 2024',
  documentation_url: 'https://docs.example.com/uv-unwrap-pro',
  license_type: 'standard',
  average_rating: '4.50',
  review_count: 8,
  total_downloads: 85,
  category: { id: categoryId, name: 'UV Tools', slug: 'uv-tools', description: '', image: '', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  images: [
    {
      id: 'img-1',
      image_url: 'https://cdn.example.com/plugin-a.jpg',
      display_order: 0,
      is_primary: true,
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
  files: [
    {
      id: 'file-1',
      file_name: 'uv_unwrap_pro.zip',
      file_format: 'zip',
      file_size: 204800,
      version: '2.1.0',
      is_primary: true,
    },
  ],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-15T00:00:00Z',
}

const relatedList = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: pluginId,
      name: 'UV Unwrap Pro',
      slug: 'uv-unwrap-pro',
      short_description: 'One-click UV unwrapping for 3D artists',
      price: '29.99',
      currency: 'USD',
      discount_price: '19.99',
      thumbnail: '',
      version: '2.1.0',
      compatibility: 'Blender 3.x',
      license_type: 'standard' as const,
      average_rating: '4.50',
      review_count: 0,
      total_downloads: 85,
      category: { id: categoryId, name: 'UV Tools', slug: 'uv-tools', description: '', image: '', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: relatedPluginId,
      name: 'Quick Seam',
      slug: 'quick-seam',
      short_description: 'Fast seam marking tool',
      price: '14.99',
      currency: 'USD',
      discount_price: null,
      thumbnail: '',
      version: '1.0.0',
      compatibility: 'Blender 4.x',
      license_type: 'standard' as const,
      average_rating: '4.00',
      review_count: 0,
      total_downloads: 30,
      category: { id: categoryId, name: 'UV Tools', slug: 'uv-tools', description: '', image: '', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      created_at: '2026-02-01T00:00:00Z',
    },
  ],
}

function renderPluginDetails(initialPath = '/plugins/uv-unwrap-pro') {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/plugins/:slug" element={<PluginDetailsPage />} />
          <Route path="/login" element={<div>Login page</div>} />
          <Route path="/plugins" element={<div>Browse plugins page</div>} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetAuthStore()
  resetToastStore()
  vi.mocked(pluginsApi.getPublicPlugin).mockResolvedValue(sampleDetail)
  vi.mocked(pluginsApi.listPublicPlugins).mockResolvedValue(relatedList)
  vi.mocked(wishlistApi.listWishlistItems).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  vi.mocked(cartApi.getCart).mockResolvedValue({
    id: 'cart-id',
    currency: 'USD',
    subtotal: '0.00',
    discount_amount: '0.00',
    total: '0.00',
    item_count: 0,
    total_quantity: 0,
    items: [],
  })
  vi.mocked(reviewsApi.listReviews).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  vi.mocked(reviewsApi.getReviewEligibility).mockResolvedValue({
    can_review: false,
    has_reviewed: false,
    review: null,
  })
})

describe('PluginDetailsPage', () => {
  it('shows loading skeleton while fetching plugin data', () => {
    vi.mocked(pluginsApi.getPublicPlugin).mockReturnValue(new Promise(() => {}))
    renderPluginDetails()

    expect(screen.getByLabelText(/loading plugin details/i)).toBeInTheDocument()
  })

  it('loads the public plugin by slug and renders hero details', async () => {
    renderPluginDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /uv unwrap pro/i }),
      ).toBeInTheDocument()
    })

    expect(pluginsApi.getPublicPlugin).toHaveBeenCalledWith('uv-unwrap-pro')
    expect(screen.getByText(/one-click uv unwrapping for 3d artists/i)).toBeInTheDocument()
    expect(screen.getByText('Version')).toBeInTheDocument()
    expect(screen.getAllByText('2.1.0').length).toBeGreaterThan(0)
    expect(document.title).toContain('UV Unwrap Pro')
  })

  it('uses the same description and comments layout as a 3D model detail page', async () => {
    renderPluginDetails()

    const commentsHeading = await screen.findByRole('heading', {
      name: /reviews & comments/i,
    })
    const commentsSection = commentsHeading.closest('section')
    const mediaReviews = commentsSection?.parentElement

    expect(screen.getByRole('heading', { name: /^description$/i })).toBeInTheDocument()
    expect(screen.getByText(sampleDetail.description)).toBeInTheDocument()
    expect(mediaReviews).toHaveClass('product-hub-detail__media-reviews')
    expect(mediaReviews?.parentElement).toHaveClass('product-detail-layout__media')

    const similarPlugins = screen.getByRole('heading', { name: /similar plugins/i })
    expect(similarPlugins.closest('.product-hub-detail__lower-grid')).toBeInTheDocument()
  })

  it('renders discount price and sale badge', async () => {
    renderPluginDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /uv unwrap pro/i }),
      ).toBeInTheDocument()
    })

    expect(screen.getAllByText(/\$19\.99/).length).toBeGreaterThan(0)
    expect(screen.getByText(/-33%/i)).toBeInTheDocument()
  })

  it('renders a close link back to plugins', async () => {
    renderPluginDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /uv unwrap pro/i }),
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: /close/i })).toHaveAttribute('href', '/plugins')
  })

  it('renders technical specs including compatibility', async () => {
    renderPluginDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /uv unwrap pro/i }),
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('heading', { name: /technical specs/i })).toBeInTheDocument()
    expect(screen.getAllByText(/blender 3\.x, 3ds max 2024/i).length).toBeGreaterThan(0)
  })

  it('renders documentation link when documentation_url is present', async () => {
    renderPluginDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /uv unwrap pro/i }),
      ).toBeInTheDocument()
    })

    const docsLink = screen.getByRole('link', { name: /view documentation/i })
    expect(docsLink).toHaveAttribute('href', 'https://docs.example.com/uv-unwrap-pro')
    expect(docsLink).toHaveAttribute('target', '_blank')
    expect(docsLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('hides documentation section when documentation_url is empty', async () => {
    vi.mocked(pluginsApi.getPublicPlugin).mockResolvedValue({
      ...sampleDetail,
      documentation_url: '',
    })

    renderPluginDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /uv unwrap pro/i }),
      ).toBeInTheDocument()
    })

    expect(screen.queryByRole('link', { name: /view documentation/i })).not.toBeInTheDocument()
  })

  it('shows not-found state for unpublished or missing plugins', async () => {
    const error = new AxiosError('Not found')
    error.response = {
      status: 404,
      statusText: 'Not Found',
      headers: {},
      config: { headers: {} } as never,
      data: { detail: 'Not found.' },
    }
    vi.mocked(pluginsApi.getPublicPlugin).mockRejectedValue(error)

    renderPluginDetails('/plugins/hidden-plugin')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: /homepage/i })).toHaveAttribute('href', '/home')
  })

  it('shows error state with retry for non-404 failures', async () => {
    vi.mocked(pluginsApi.getPublicPlugin).mockRejectedValue(new Error('network down'))

    renderPluginDetails()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /failed to load plugin/i })).toBeInTheDocument()
    })

    vi.mocked(pluginsApi.getPublicPlugin).mockResolvedValue(sampleDetail)
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /uv unwrap pro/i }),
      ).toBeInTheDocument()
    })
  })

  it('prompts guests to sign in for cart and wishlist CTAs', async () => {
    renderPluginDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /uv unwrap pro/i }),
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /sign in to add to cart/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /sign in to add .+ to wishlist/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in to buy/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /share link for/i })).not.toBeInTheDocument()
  })

  it('shows working add-to-cart and wishlist controls for authenticated users', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      accessToken: 'access-token',
      user: testUser,
      isAuthenticated: true,
      postLogoutRedirect: null,
    })
    vi.mocked(wishlistApi.addWishlistItem).mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      product_type: 'plugin',
      product_id: pluginId,
      catalog: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    vi.mocked(cartApi.addCartItem).mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      product_type: 'plugin',
      product_id: pluginId,
      quantity: 1,
      unit_price: '19.99',
      line_total: '19.99',
      catalog: null,
    })

    renderPluginDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /uv unwrap pro/i }),
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /^buy now$/i })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /^add to cart$/i }))
    expect(vi.mocked(cartApi.addCartItem).mock.calls[0]?.[0]).toEqual({
      product_type: 'plugin',
      product_id: pluginId,
      quantity: 1,
    })
    await user.click(
      screen.getByRole('button', { name: /add to wishlist for uv unwrap pro/i }),
    )
    expect(vi.mocked(wishlistApi.addWishlistItem).mock.calls[0]?.[0]).toEqual({
      product_type: 'plugin',
      product_id: pluginId,
    })
  })

  it('starts Stripe checkout when Buy now is clicked', async () => {
    const user = userEvent.setup()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
    })

    useAuthStore.setState({
      accessToken: 'access-token',
      user: testUser,
      isAuthenticated: true,
      postLogoutRedirect: null,
    })
    vi.mocked(cartApi.getCart).mockResolvedValue({
      id: 'cart-id',
      currency: 'USD',
      subtotal: '0.00',
      discount_amount: '0.00',
      total: '0.00',
      item_count: 0,
      total_quantity: 0,
      items: [],
    })
    vi.mocked(cartApi.addCartItem).mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      product_type: 'plugin',
      product_id: pluginId,
      quantity: 1,
      unit_price: '19.99',
      line_total: '19.99',
      catalog: null,
    })
    vi.mocked(paymentsApi.createCheckoutSession).mockResolvedValue({
      checkout_url: 'https://checkout.stripe.com/pay/cs_test_plugin',
      order_id: 'order-id',
    })

    renderPluginDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /uv unwrap pro/i }),
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^buy now$/i }))

    await waitFor(() => {
      expect(cartApi.addCartItem).toHaveBeenCalledWith({
        product_type: 'plugin',
        product_id: pluginId,
        quantity: 1,
      })
      expect(paymentsApi.createCheckoutSession).toHaveBeenCalledTimes(1)
      expect(window.location.href).toBe('https://checkout.stripe.com/pay/cs_test_plugin')
    })

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('hides the share control and short summary and excludes package storage paths', async () => {
    renderPluginDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /uv unwrap pro/i }),
      ).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /share link for/i })).not.toBeInTheDocument()
    expect(screen.queryByText(sampleDetail.short_description)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/storage_path/i)
    expect(document.body.innerHTML).not.toContain('uv_unwrap_pro.zip')
  })

  it('renders related plugins from the same category and excludes the current plugin', async () => {
    renderPluginDetails()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /quick seam/i })).toBeInTheDocument()
    })

    expect(pluginsApi.listPublicPlugins).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: categoryId }),
    )
    expect(
      screen.getAllByRole('heading', { name: /uv unwrap pro/i }).length,
    ).toBe(1)
  })

  it('renders plugin specs including version, file format, and file size', async () => {
    renderPluginDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /uv unwrap pro/i }),
      ).toBeInTheDocument()
    })

    expect(screen.getByText('Version')).toBeInTheDocument()
    expect(screen.getAllByText('2.1.0').length).toBeGreaterThan(0)
    expect(screen.getByText('Formats')).toBeInTheDocument()
    expect(screen.getByText('ZIP')).toBeInTheDocument()
    expect(screen.getByText('200.0 KB')).toBeInTheDocument()
  })

  it('does not expose package download URLs or storage paths on the page', async () => {
    renderPluginDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /uv unwrap pro/i }),
      ).toBeInTheDocument()
    })

    expect(document.body.innerHTML).not.toContain('uv_unwrap_pro.zip')
    expect(document.body.textContent).not.toMatch(/storage_path/i)
  })
})
