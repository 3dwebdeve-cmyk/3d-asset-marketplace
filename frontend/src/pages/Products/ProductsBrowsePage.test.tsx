import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as categoriesApi from '../../api/categoriesApi'
import * as pluginsApi from '../../api/pluginsApi'
import * as productsApi from '../../api/productsApi'
import * as wishlistApi from '../../api/wishlistApi'
import { createTestQueryClient, resetAuthStore, testUser } from '../../test/test-utils'
import { useAuthStore } from '../../store/authStore'
import { ProductsBrowsePage } from './ProductsBrowsePage'

vi.mock('../../api/productsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/productsApi')>(
    '../../api/productsApi',
  )
  return {
    ...actual,
    listPublicProducts: vi.fn(),
  }
})

vi.mock('../../api/categoriesApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/categoriesApi')>(
    '../../api/categoriesApi',
  )
  return {
    ...actual,
    listPublicCategories: vi.fn(),
  }
})

vi.mock('../../api/pluginsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/pluginsApi')>(
    '../../api/pluginsApi',
  )
  return {
    ...actual,
    listPublicPlugins: vi.fn(),
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

const categoryId = '44bba207-8a0c-490d-abdf-5a383ed2111b'
const productId = 'b3d66e20-e133-4506-a6c5-a47d2ee5cd00'
const pluginId = 'c4e77f31-f244-5617-b58d-b58e3ff6de11'

const samplePublicProducts = {
  count: 1,
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
      category: { id: categoryId, name: 'Sci-Fi Assets', slug: 'sci-fi-assets' },
      license_type: 'standard' as const,
      average_rating: '4.80',
      review_count: 0,
      total_downloads: 120,
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
}

const samplePublicCategories = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: categoryId,
      name: 'Sci-Fi Assets',
      slug: 'sci-fi-assets',
      description: 'Futuristic 3D assets',
      image: '',
      parent: null,
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
}

const samplePublicPlugins = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: pluginId,
      name: 'Batch Exporter Pro',
      slug: 'batch-exporter-pro',
      short_description: 'Export tools for artists',
      price: '19.99',
      currency: 'USD',
      discount_price: null,
      thumbnail: '',
      version: '1.0.0',
      compatibility: 'Blender 4.0+',
      license_type: 'standard' as const,
      category: {
        id: 'plugin-cat-1',
        name: 'Utilities',
        slug: 'utilities',
        description: '',
        image: '',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      average_rating: '4.50',
      review_count: 2,
      total_downloads: 40,
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
}

function renderProductsBrowsePage(initialPath = '/products') {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/products" element={<ProductsBrowsePage />} />
          <Route path="/plugins" element={<div>Plugins page</div>} />
          <Route path="/custom-projects" element={<div>Custom projects page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetAuthStore()
  vi.mocked(productsApi.listPublicProducts).mockResolvedValue(samplePublicProducts)
  vi.mocked(categoriesApi.listPublicCategories).mockResolvedValue(samplePublicCategories)
  vi.mocked(pluginsApi.listPublicPlugins).mockResolvedValue(samplePublicPlugins)
  vi.mocked(wishlistApi.listWishlistItems).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
})

describe('ProductsBrowsePage', () => {
  it('renders browse hub hero, modules, and product preview', async () => {
    renderProductsBrowsePage()

    expect(
      screen.getByRole('heading', {
        name: /the ultimate marketplace for 3d & digital assets/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /trending categories/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /shop 3d models/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /explore plugins/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk Drone 3D')).toBeInTheDocument()
    })

    expect(screen.getByText('Batch Exporter Pro')).toBeInTheDocument()
    expect(screen.getAllByText('Sci-Fi Assets').length).toBeGreaterThan(0)
    expect(screen.getByText('$39.99')).toBeInTheDocument()
    expect(screen.getByText('$49.99')).toBeInTheDocument()
  })

  it('opens full catalog when Shop 3D models is clicked', async () => {
    const user = userEvent.setup()
    renderProductsBrowsePage()

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk Drone 3D')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /shop 3d models/i }))

    expect(
      screen.getByRole('heading', { name: /explore premium 3d models/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^category$/i)).toBeInTheDocument()
  })

  it('filters products by category selection in catalog mode', async () => {
    const user = userEvent.setup()
    renderProductsBrowsePage('/products?view=all')

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk Drone 3D')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText(/^category$/i), categoryId)

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          category_id: categoryId,
        }),
      )
    })
  })

  it('applies category filter from the URL query string', async () => {
    renderProductsBrowsePage(`/products?category=${encodeURIComponent(categoryId)}`)

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          category_id: categoryId,
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByLabelText(/^category$/i)).toHaveValue(categoryId)
    })
  })

  it('applies search from the URL query string', async () => {
    renderProductsBrowsePage('/products?search=drone')

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'drone',
        }),
      )
    })

    expect(screen.getByRole('searchbox', { name: /search 3d models/i })).toHaveValue('drone')
  })

  it('sorts products by price low to high in catalog mode', async () => {
    const user = userEvent.setup()
    renderProductsBrowsePage('/products?view=all')

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk Drone 3D')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText(/sort by/i), 'price')

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          ordering: 'price',
        }),
      )
    })
  })

  it('shows empty state when no products match filters', async () => {
    vi.mocked(productsApi.listPublicProducts).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    renderProductsBrowsePage('/products?view=all')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /no 3d models found/i })).toBeInTheDocument()
    })
  })

  it('shows wishlist toggle on product cards for authenticated users', async () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: testUser,
      isAuthenticated: true,
      postLogoutRedirect: null,
    })

    renderProductsBrowsePage()

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk Drone 3D')).toBeInTheDocument()
    })

    expect(
      screen.getByRole('button', {
        name: /add to wishlist for cyberpunk drone 3d/i,
      }),
    ).toBeInTheDocument()
  })
})
