import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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
    listTrendingCategories: vi.fn(),
    recordCategoryClick: vi.fn().mockResolvedValue({ id: 'x', click_count: 1 }),
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
      software_used: 'Blender',
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

function ModelsCatalogRoute() {
  const location = useLocation()
  return (
    <>
      <div>3D Models catalog page</div>
      <div data-testid="location">
        {location.pathname}
        {location.search}
      </div>
    </>
  )
}

function renderProductsBrowsePage(initialPath = '/home') {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/home" element={<ProductsBrowsePage />} />
          <Route path="/categories" element={<div>All categories page</div>} />
          <Route path="/3d-models" element={<ModelsCatalogRoute />} />
          <Route path="/3d-models/:categorySlug" element={<ModelsCatalogRoute />} />
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
  vi.mocked(categoriesApi.listTrendingCategories).mockResolvedValue(samplePublicCategories.results)
  vi.mocked(categoriesApi.recordCategoryClick).mockResolvedValue({
    id: categoryId,
    click_count: 1,
  })
  vi.mocked(pluginsApi.listPublicPlugins).mockResolvedValue(samplePublicPlugins)
  vi.mocked(wishlistApi.listWishlistItems).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
})

describe('ProductsBrowsePage', () => {
  it('starts the model carousel after loading finishes when demo cards were already available', async () => {
    // Development fallback cards make scrolling eligible before the real rail mounts.
    // An empty API response keeps those same cards, so eligibility must track loading too.
    vi.mocked(productsApi.listPublicProducts).mockResolvedValue({
      ...samplePublicProducts, count: 0, results: [],
    })
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const { container, unmount } = renderProductsBrowsePage()

    expect(screen.getByLabelText('Loading products')).toBeInTheDocument()
    expect(requestFrame).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading products')).not.toBeInTheDocument()
      expect(requestFrame).toHaveBeenCalled()
    })
    const rail = container.querySelector<HTMLElement>('.browse-rail-section--models .browse-rail--auto')!
    expect(rail).toBeInTheDocument()
    Object.defineProperties(rail, {
      scrollWidth: { configurable: true, value: 1000 },
      clientWidth: { configurable: true, value: 300 },
    })
    requestFrame.mock.calls[0][0](performance.now() + 100)
    expect(rail.scrollLeft).toBeGreaterThan(0)
    unmount()
  })

  it('renders browse hub hero, modules, and product preview', async () => {
    renderProductsBrowsePage()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /furniture & interior 3D models for visualization and design/i,
    )
    expect(screen.queryByText(/world's largest/i)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /trending categories/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /shop 3d models/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /explore plugins/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk Drone 3D')).toBeInTheDocument()
    })

    expect(screen.getByText('Batch Exporter Pro')).toBeInTheDocument()
    expect(screen.getAllByText('Sci-Fi Assets').length).toBeGreaterThan(0)
    expect(screen.getByText('$ 39.99')).toBeInTheDocument()
    expect(screen.getByText('$ 49.99')).toBeInTheDocument()
  })

  it('shows custom service offers under the plugins section', () => {
    renderProductsBrowsePage()

    expect(screen.getByRole('heading', { name: /what we offer/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /custom 3d model/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /custom plugin/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /custom texturing/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /custom rendering/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /get custom model/i })).toHaveAttribute(
      'href',
      '/custom-projects',
    )
    expect(screen.getByRole('link', { name: /get custom texture/i })).toHaveAttribute(
      'href',
      '/custom-projects',
    )
    expect(screen.getByRole('link', { name: /get custom render/i })).toHaveAttribute(
      'href',
      '/custom-projects',
    )
    expect(
      screen.getByText(/custom 3d models for furniture, products and interiors/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/product & game-ready models/i)).toBeInTheDocument()
    expect(screen.getByText(/clean & optimized topology/i)).toBeInTheDocument()
    expect(
      screen.getByText(/powerful blender add-ons and tools/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/custom blender add-ons/i)).toBeInTheDocument()
    expect(
      screen.getByText(/realistic and stylized textures that bring/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/pbr & stylized texturing/i)).toBeInTheDocument()
    expect(
      screen.getByText(/high-quality renders with perfect lighting/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/photorealistic renders/i)).toBeInTheDocument()
  })

  it('searches the 3D models route from the reference hero', async () => {
    const user = userEvent.setup()
    renderProductsBrowsePage()

    await user.selectOptions(screen.getByRole('combobox', { name: /search category/i }), 'models')
    await user.type(screen.getByRole('searchbox', { name: /search marketplace/i }), 'drone')
    await user.click(screen.getByRole('button', { name: /^search$/i }))

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/3d-models?search=drone')
    })
  })

  it('gives the home page its own title, description, canonical address and structured data', async () => {
    renderProductsBrowsePage()

    await waitFor(() => expect(document.title).toBe('Furniture & Interior 3D Models | AssetHive3D'))
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      expect.stringContaining('production-ready 3D models of furniture, interiors, lighting and plants'),
    )
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', expect.stringMatching(/\/$/))
    const data = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((node) =>
      [JSON.parse(node.textContent ?? '[]')].flat(),
    )
    expect(data.map((item) => item['@type'])).toEqual(expect.arrayContaining(['Organization', 'WebSite']))
  })

  it('searches a trending tag from the marketplace hero', async () => {
    const user = userEvent.setup()
    renderProductsBrowsePage()

    await user.click(screen.getByRole('button', { name: /^furniture$/i }))

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/3d-models?search=Furniture')
    })
  })

  it('opens the models catalog from hero sort pills', async () => {
    const user = userEvent.setup()
    renderProductsBrowsePage()

    await user.click(screen.getByRole('button', { name: /^newest$/i }))

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/3d-models?ordering=-created_at',
      )
    })
  })

  it('links each marketplace module to its existing destination', async () => {
    renderProductsBrowsePage()

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk Drone 3D')).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: /shop 3d models/i })).toHaveAttribute(
      'href',
      '/3d-models',
    )
    expect(screen.getByRole('link', { name: /explore plugins/i })).toHaveAttribute(
      'href',
      '/plugins',
    )
    expect(screen.getByRole('link', { name: /submit an inquiry/i })).toHaveAttribute(
      'href',
      '/custom-projects',
    )
    expect(
      screen.getByText('Browse production-ready 3D models of furniture, interiors, lighting, plants and more.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Speed up your 3D workflow with Blender and Unreal plugins and tools.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Need a custom 3D model, texture or render? Send your brief and our team will reply.'),
    ).toBeInTheDocument()
  })

  it('limits trending categories to twelve tiles', async () => {
    const manyCategories = Array.from({ length: 20 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: `Category ${index + 1}`,
      slug: `category-${index + 1}`,
      description: '',
      image: '',
      parent: null,
      created_at: '2026-01-01T00:00:00Z',
    }))
    vi.mocked(categoriesApi.listTrendingCategories).mockResolvedValue(manyCategories.slice(0, 12))

    renderProductsBrowsePage()

    const categorySection = await screen.findByRole('region', {
      name: /trending categories/i,
    })
    await waitFor(() => {
      expect(within(categorySection).getAllByRole('link', { name: /^browse category/i })).toHaveLength(12)
    })
    expect(categoriesApi.listTrendingCategories).toHaveBeenCalledWith(50)
  })

  it('renders backend categories and filters the existing models route', async () => {
    const user = userEvent.setup()
    renderProductsBrowsePage()

    await waitFor(() => {
      expect(categoriesApi.listTrendingCategories).toHaveBeenCalledWith(50)
    })

    const categorySection = screen.getByRole('region', {
      name: /trending categories/i,
    })
    const categoryLink = await within(categorySection).findByRole('link', {
      name: /browse sci-fi assets 3d models/i,
    })

    // A real link to the category's own readable address, which search engines can follow.
    expect(categoryLink).toHaveAttribute('href', '/3d-models/sci-fi-assets')
    expect(within(categorySection).getAllByRole('link', { name: /^browse/i })).toHaveLength(1)

    await user.click(categoryLink)

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/3d-models/sci-fi-assets')
    })
    expect(categoriesApi.recordCategoryClick).toHaveBeenCalledWith(categoryId)
  })

  it('opens the category directory with the full category count', async () => {
    const user = userEvent.setup()
    vi.mocked(categoriesApi.listPublicCategories).mockResolvedValue({
      ...samplePublicCategories,
      count: 17,
      results: Array.from({ length: 17 }, (_, index) => ({
        ...samplePublicCategories.results[0],
        id: `category-${index}`,
        name: `Category ${index}`,
        slug: `category-${index}`,
      })),
    })
    renderProductsBrowsePage()

    const link = await screen.findByRole('link', { name: /view all 17 categories/i })
    expect(link).toHaveAttribute('href', '/categories')
    await user.click(link)
    expect(screen.getByText('All categories page')).toBeInTheDocument()
  })

  it('redirects old catalog query URLs to /3d-models', async () => {
    renderProductsBrowsePage(`/home?category=${encodeURIComponent(categoryId)}`)

    await waitFor(() => {
      expect(screen.getByText('3D Models catalog page')).toBeInTheDocument()
    })
  })

  it('redirects view=all catalog mode to /3d-models', async () => {
    renderProductsBrowsePage('/home?view=all')

    await waitFor(() => {
      expect(screen.getByText('3D Models catalog page')).toBeInTheDocument()
    })
  })

  it('redirects search catalog URLs to /3d-models', async () => {
    renderProductsBrowsePage('/home?search=drone')

    await waitFor(() => {
      expect(screen.getByText('3D Models catalog page')).toBeInTheDocument()
    })
  })

  it('shows wishlist toggle on product cards for authenticated users', async () => {
    useAuthStore.setState({
      accessToken: 'access-token',
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
