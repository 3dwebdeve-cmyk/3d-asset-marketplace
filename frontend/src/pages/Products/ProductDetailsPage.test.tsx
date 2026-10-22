import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as productsApi from '../../api/productsApi'
import * as cartApi from '../../api/cartApi'
import * as paymentsApi from '../../api/paymentsApi'
import * as wishlistApi from '../../api/wishlistApi'
import * as reviewsApi from '../../api/reviewsApi'
import {
  createTestQueryClient,
  resetAuthStore,
  resetAuthUiStore,
  resetToastStore,
  testUser,
} from '../../test/test-utils'
import { useAuthStore } from '../../store/authStore'
import { useAuthUiStore } from '../../store/authUiStore'
import type { PublicProductDetail } from '../../types/product'
import { ProductDetailsPage } from './ProductDetailsPage'
import { Toaster } from '../../components/ui/Toaster'

vi.mock('../../api/productsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/productsApi')>(
    '../../api/productsApi',
  )
  return {
    ...actual,
    getPublicProduct: vi.fn(),
    listPublicProducts: vi.fn(),
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

vi.mock('../../components/viewer/LazyModelViewer', () => ({
  LazyModelViewer: ({ ariaLabel, modelUrl }: { ariaLabel: string; modelUrl: string }) => (
    <div data-testid="lazy-model-viewer" role="group" aria-label={ariaLabel} data-model-url={modelUrl} />
  ),
}))

const categoryId = '44bba207-8a0c-490d-abdf-5a383ed2111b'
const productId = 'b3d66e20-e133-4506-a6c5-a47d2ee5cd00'
const relatedProductId = 'c4e77f31-f244-5617-b7d6-b58e3ff6de11'

const sampleDetail: PublicProductDetail = {
  id: productId,
  name: 'Cyberpunk Drone 3D',
  slug: 'cyberpunk-drone-3d',
  description: 'A detailed sci-fi drone for cinematic scenes.',
  short_description: 'Futuristic sci-fi drone asset',
  price: '49.99',
  currency: 'USD',
  discount_price: '39.99',
  thumbnail: 'https://cdn.example.com/thumb.jpg',
  preview_model: 'https://cdn.example.com/preview.glb',
  preview_video: '',
  polygon_count: 12000,
  vertex_count: 8000,
  software_used: 'Blender',
  animated: true,
  rigged: false,
  pbr_ready: true,
  game_ready: true,
  license_type: 'standard',
  average_rating: '4.80',
  review_count: 12,
  total_downloads: 120,
  category: { id: categoryId, name: 'Sci-Fi Assets', slug: 'sci-fi-assets' },
  images: [
    {
      id: 'img-1',
      image_url: 'https://cdn.example.com/a.jpg',
      display_order: 0,
      is_primary: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'img-2',
      image_url: 'https://cdn.example.com/b.jpg',
      display_order: 1,
      is_primary: false,
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
  files: [
    {
      id: 'file-1',
      file_name: 'drone.glb',
      file_format: 'glb',
      file_size: 1024,
      version: '1.0',
      is_preview: true,
    },
  ],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
}

const relatedList = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: productId,
      name: 'Cyberpunk Drone 3D',
      slug: 'cyberpunk-drone-3d',
      short_description: 'Futuristic sci-fi drone asset',
      price: '49.99',
      currency: 'USD',
      discount_price: '39.99',
      thumbnail: '',
      software_used: 'Blender',
      category: { id: categoryId, name: 'Sci-Fi Assets', slug: 'sci-fi-assets' },
      license_type: 'standard' as const,
      average_rating: '4.80',
      review_count: 0,
      total_downloads: 120,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: relatedProductId,
      name: 'Neon Hoverbike',
      slug: 'neon-hoverbike',
      short_description: 'Street-ready hoverbike',
      price: '59.00',
      currency: 'USD',
      discount_price: null,
      thumbnail: '',
      software_used: 'Maya',
      category: { id: categoryId, name: 'Sci-Fi Assets', slug: 'sci-fi-assets' },
      license_type: 'extended' as const,
      average_rating: '4.20',
      review_count: 0,
      total_downloads: 40,
      created_at: '2026-01-03T00:00:00Z',
    },
  ],
}

function renderProductDetails(initialPath = '/products/cyberpunk-drone-3d') {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/products/:slug" element={<ProductDetailsPage />} />
          <Route path="/login" element={<div>Login page</div>} />
          <Route path="/products" element={<div>Browse page</div>} />
          <Route path="/3d-models" element={<div>3D Models catalog page</div>} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetAuthStore()
  resetAuthUiStore()
  resetToastStore()
  vi.mocked(productsApi.getPublicProduct).mockResolvedValue(sampleDetail)
  vi.mocked(productsApi.listPublicProducts).mockResolvedValue(relatedList)
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

describe('ProductDetailsPage', () => {
  it('scrolls to the top when the product page is opened', async () => {
    const scrollTo = vi.fn()
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      writable: true,
      value: scrollTo,
    })

    renderProductDetails()

    expect(scrollTo).toHaveBeenCalled()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /cyberpunk drone 3d/i }),
      ).toBeInTheDocument()
    })

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
  })

  it('loads the public product by slug and renders hero details', async () => {
    renderProductDetails()

    expect(screen.getByLabelText(/loading product details/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /cyberpunk drone 3d/i }),
      ).toBeInTheDocument()
    })

    expect(productsApi.getPublicProduct).toHaveBeenCalledWith('cyberpunk-drone-3d')
    expect(screen.getByText(/standard license/i)).toBeInTheDocument()
    expect(screen.getByText(/-20%/i)).toBeInTheDocument()
    expect(screen.queryByText(/futuristic sci-fi drone asset/i)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /preview specifications/i })).toBeInTheDocument()
    expect(screen.getByText(/^triangles$/i)).toBeInTheDocument()
    expect(screen.getByText('12,000')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /close/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show 3d preview/i })).not.toBeInTheDocument()
    expect(
      screen.getByRole('group', { name: /interactive 3d preview of cyberpunk drone 3d/i }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('lazy-model-viewer')).toBeInTheDocument()
    expect(document.title).toContain('Cyberpunk Drone 3D')

    expect(screen.queryByRole('link', { name: /browse sci-fi assets/i })).not.toBeInTheDocument()
  })

  describe('search engine tags', () => {
    function structuredData(): Array<Record<string, any>> {
      return [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((node) =>
        [JSON.parse(node.textContent ?? '[]')].flat(),
      )
    }

    it('gives the page a keyword title, a factual description and its own canonical address', async () => {
      renderProductDetails()
      await screen.findByRole('heading', { level: 1, name: /cyberpunk drone 3d/i })

      await waitFor(() => {
        expect(document.title).toMatch(/^Cyberpunk Drone 3D.*3D Model \| AssetHive3D$/)
      })
      // A hand-written short description is used exactly as written.
      expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
        'content',
        'Futuristic sci-fi drone asset',
      )
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        'href',
        expect.stringMatching(/\/products\/cyberpunk-drone-3d$/),
      )
      expect(document.querySelector('meta[property="og:type"]')).toHaveAttribute('content', 'product')
      expect(document.querySelector('meta[property="og:image"]')).toHaveAttribute(
        'content',
        'https://cdn.example.com/thumb.jpg',
      )
    })

    it('builds the description only from real facts when no short description was written', async () => {
      vi.mocked(productsApi.getPublicProduct).mockResolvedValue({ ...sampleDetail, short_description: '' })
      renderProductDetails()
      await screen.findByRole('heading', { level: 1, name: /cyberpunk drone 3d/i })

      await waitFor(() => {
        expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
          'content',
          'Cyberpunk Drone 3D: Sci-Fi Assets 3D model, 12,000 polygons. Preview in 3D, secure checkout and instant download. Standard license.',
        )
      })
    })

    it('publishes the real price, currency and rating as structured data, nothing invented', async () => {
      renderProductDetails()
      await screen.findByRole('heading', { level: 1, name: /cyberpunk drone 3d/i })

      await waitFor(() => expect(structuredData().some((item) => item['@type'] === 'Product')).toBe(true))
      const product = structuredData().find((item) => item['@type'] === 'Product')!
      expect(product.name).toBe('Cyberpunk Drone 3D')
      expect(product.offers).toMatchObject({
        '@type': 'Offer',
        priceCurrency: 'USD',
        price: '39.99',
        availability: 'https://schema.org/InStock',
      })
      expect(product.aggregateRating).toMatchObject({ ratingValue: 4.8, reviewCount: 12 })
      expect(product.image).toEqual(expect.arrayContaining(['https://cdn.example.com/thumb.jpg']))
    })

    it('adds a breadcrumb trail through the category and links the category in the page', async () => {
      renderProductDetails()
      await screen.findByRole('heading', { level: 1, name: /cyberpunk drone 3d/i })

      await waitFor(() => expect(structuredData().some((item) => item['@type'] === 'BreadcrumbList')).toBe(true))
      const crumbs = structuredData().find((item) => item['@type'] === 'BreadcrumbList')!
      expect(crumbs.itemListElement.map((entry: { name: string }) => entry.name)).toEqual([
        'Home',
        '3D Models',
        'Sci-Fi Assets',
        'Cyberpunk Drone 3D',
      ])
      expect(screen.getByRole('link', { name: 'Sci-Fi Assets' })).toHaveAttribute('href', '/3d-models/sci-fi-assets')
    })

    it('keeps placeholder demo products out of search results, and indexes real ones', async () => {
      renderProductDetails()
      await screen.findByRole('heading', { level: 1, name: /cyberpunk drone 3d/i })
      expect(document.querySelector('meta[name="robots"]')).toBeNull()
    })

    it('does not index a demo product', async () => {
      vi.mocked(productsApi.getPublicProduct).mockResolvedValue({
        ...sampleDetail,
        category: { id: 'demo', name: 'Demo Assets', slug: 'demo-assets' },
      })
      renderProductDetails()
      await screen.findByRole('heading', { level: 1, name: /cyberpunk drone 3d/i })
      await waitFor(() => {
        expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
      })
    })

    it('removes its tags again when the visitor leaves the page', async () => {
      const { unmount } = renderProductDetails()
      await screen.findByRole('heading', { level: 1, name: /cyberpunk drone 3d/i })
      await waitFor(() => expect(document.querySelector('link[rel="canonical"]')).not.toBeNull())

      unmount()

      expect(document.querySelector('link[rel="canonical"]')).toBeNull()
      expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0)
    })
  })

  it('keeps the image stage when no preview model is available', async () => {
    vi.mocked(productsApi.getPublicProduct).mockResolvedValue({
      ...sampleDetail,
      preview_model: '',
    })

    renderProductDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /cyberpunk drone 3d/i }),
      ).toBeInTheDocument()
    })

    expect(screen.queryByTestId('lazy-model-viewer')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show 3d preview/i })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /view larger image of cyberpunk drone 3d/i }),
    ).toBeInTheDocument()
  })

  it('uses the real demo preview for a catalog entry seeded with the triangle fixture', async () => {
    vi.mocked(productsApi.getPublicProduct).mockResolvedValue({
      ...sampleDetail,
      name: 'Demo Plant Pot',
      slug: 'demo-plant-pot',
      preview_model: 'http://localhost:5173/fixtures/e2e-preview.glb',
    })

    renderProductDetails('/products/demo-plant-pot')

    expect(await screen.findByTestId('lazy-model-viewer')).toHaveAttribute(
      'data-model-url',
      `${window.location.origin}/fixtures/demo-plant-pot.glb`,
    )
  })

  it('does not mount the viewer for unsafe preview_model URLs', async () => {
    vi.mocked(productsApi.getPublicProduct).mockResolvedValue({
      ...sampleDetail,
      preview_model: 'https://cdn.example.com/private/package.zip',
    })

    renderProductDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /cyberpunk drone 3d/i }),
      ).toBeInTheDocument()
    })

    expect(screen.queryByTestId('lazy-model-viewer')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('private/package.zip')
  })

  it('shows not-found state for unpublished or missing products', async () => {
    const error = new AxiosError('Not found')
    error.response = {
      status: 404,
      statusText: 'Not Found',
      headers: {},
      config: { headers: {} } as never,
      data: { detail: 'Not found.' },
    }
    vi.mocked(productsApi.getPublicProduct).mockRejectedValue(error)

    renderProductDetails('/products/hidden-desk')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: /homepage/i })).toHaveAttribute('href', '/')
  })

  it('shows error state with retry for non-404 failures', async () => {
    vi.mocked(productsApi.getPublicProduct).mockRejectedValue(new Error('network down'))

    renderProductDetails()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /failed to load product/i })).toBeInTheDocument()
    })

    vi.mocked(productsApi.getPublicProduct).mockResolvedValue(sampleDetail)
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /cyberpunk drone 3d/i }),
      ).toBeInTheDocument()
    })
  })

  it('supports keyboard-accessible image gallery lightbox', async () => {
    const user = userEvent.setup()
    renderProductDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /cyberpunk drone 3d/i }),
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /show image 1 of 2/i }))
    await user.click(
      screen.getByRole('button', { name: /view larger image of cyberpunk drone 3d/i }),
    )

    const dialog = await screen.findByRole('dialog', { name: /image viewer/i })
    expect(within(dialog).getByAltText(/cyberpunk drone 3d 3d model, image 1/i)).toBeInTheDocument()

    await user.keyboard('{ArrowRight}')
    expect(within(dialog).getByAltText(/cyberpunk drone 3d 3d model, image 2/i)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /image viewer/i })).not.toBeInTheDocument()
    })
  })

  it('prompts guests to sign in for cart and wishlist CTAs', async () => {
    const user = userEvent.setup()
    renderProductDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /cyberpunk drone 3d/i }),
      ).toBeInTheDocument()
    })

    expect(
      screen.getAllByRole('button', { name: /^add to cart$/i }).length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByRole('button', { name: /sign in to add .+ to wishlist/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^buy now$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /share link for/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/sign in to leave a review/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add a comment/i }))

    expect(useAuthUiStore.getState().isOpen).toBe(true)
    expect(useAuthUiStore.getState().mode).toBe('login')
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
      product_type: 'product',
      product_id: productId,
      catalog: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    vi.mocked(cartApi.addCartItem).mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      product_type: 'product',
      product_id: productId,
      quantity: 1,
      unit_price: '39.99',
      line_total: '39.99',
      catalog: null,
    })

    renderProductDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /cyberpunk drone 3d/i }),
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /^buy now$/i })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /add to cart/i }))
    expect(vi.mocked(cartApi.addCartItem).mock.calls[0]?.[0]).toEqual({
      product_type: 'product',
      product_id: productId,
      quantity: 1,
    })
    await user.click(
      screen.getByRole('button', { name: /add to wishlist for cyberpunk drone 3d/i }),
    )
    expect(vi.mocked(wishlistApi.addWishlistItem).mock.calls[0]?.[0]).toEqual({
      product_type: 'product',
      product_id: productId,
    })
  })

  it('clears posted and updated comments after saving, but preserves failed submissions', async () => {
    const user = userEvent.setup({ delay: null })
    useAuthStore.setState({
      accessToken: 'access-token',
      user: testUser,
      isAuthenticated: true,
      postLogoutRedirect: null,
    })
    vi.mocked(reviewsApi.getReviewEligibility).mockResolvedValue({
      can_review: true,
      has_reviewed: false,
      review: null,
    })
    const savedReview = {
      id: '33333333-3333-3333-3333-333333333333',
      product_type: 'product' as const,
      product_id: productId,
      rating: null,
      review_text: 'Works well in Blender.',
      author: { id: testUser.id, full_name: testUser.full_name },
      created_at: '2026-10-05T12:00:00Z',
      updated_at: '2026-10-05T12:00:00Z',
    }
    vi.mocked(reviewsApi.createReview).mockImplementation(async (payload) => {
      const review = { ...savedReview, review_text: payload.review_text ?? '' }
      vi.mocked(reviewsApi.getReviewEligibility).mockResolvedValue({
        can_review: true,
        has_reviewed: true,
        review,
      })
      return review
    })

    renderProductDetails()

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /comment/i })).toBeInTheDocument()
    })

    await user.type(screen.getByRole('textbox', { name: /comment/i }), 'Works well in Blender.{Enter}')

    await waitFor(() => {
      expect(reviewsApi.createReview).toHaveBeenCalledWith({
        product_type: 'product',
        product_id: productId,
        rating: null,
        review_text: 'Works well in Blender.',
      })
    })

    const commentBox = screen.getByRole('textbox', { name: /comment/i })
    await waitFor(() => {
      expect(commentBox).toHaveValue('')
    })

    await user.type(commentBox, 'Updated comment.{Enter}')
    await waitFor(() => {
      expect(reviewsApi.createReview).toHaveBeenLastCalledWith({
        product_type: 'product',
        product_id: productId,
        rating: null,
        review_text: 'Updated comment.',
      })
      expect(commentBox).toHaveValue('')
    })

    vi.mocked(reviewsApi.createReview).mockRejectedValueOnce(new Error('Save failed'))
    await user.type(commentBox, 'Keep this draft.{Enter}')
    await waitFor(() => {
      expect(commentBox).toHaveValue('Keep this draft.')
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
      product_type: 'product',
      product_id: productId,
      quantity: 1,
      unit_price: '39.99',
      line_total: '39.99',
      catalog: null,
    })
    vi.mocked(paymentsApi.createCheckoutSession).mockResolvedValue({
      checkout_url: 'https://checkout.stripe.com/pay/cs_test_product',
      order_id: 'order-id',
    })

    renderProductDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /cyberpunk drone 3d/i }),
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^buy now$/i }))

    await waitFor(() => {
      expect(cartApi.addCartItem).toHaveBeenCalledWith({
        product_type: 'product',
        product_id: productId,
        quantity: 1,
      })
      expect(paymentsApi.createCheckoutSession).toHaveBeenCalledTimes(1)
      expect(window.location.href).toBe('https://checkout.stripe.com/pay/cs_test_product')
    })

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('hides the share control and short summary and excludes package storage paths', async () => {
    renderProductDetails()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /cyberpunk drone 3d/i }),
      ).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /share link for/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Futuristic sci-fi drone asset')).not.toBeInTheDocument()

    expect(document.body.textContent).not.toMatch(/storage_path/i)
    expect(document.body.innerHTML).not.toContain('secret.zip')
    expect(document.body.textContent).not.toContain('https://cdn.example.com/preview.glb')
  })

  it('renders related products from the same category and excludes the current product', async () => {
    renderProductDetails()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /neon hoverbike/i })).toBeInTheDocument()
    })

    expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: categoryId }),
    )
    expect(
      screen.getAllByRole('heading', { name: /cyberpunk drone 3d/i }).length,
    ).toBe(1)
  })
})
