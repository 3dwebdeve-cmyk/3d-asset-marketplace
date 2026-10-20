import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as categoriesApi from '../../api/categoriesApi'
import * as productsApi from '../../api/productsApi'
import { createTestQueryClient } from '../../test/test-utils'
import { ModelsBrowsePage } from './ModelsBrowsePage'

vi.mock('../../api/productsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/productsApi')>(
    '../../api/productsApi',
  )
  return {
    ...actual,
    listPublicProducts: vi.fn(),
    getPublicProduct: vi.fn(),
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

const categoryId = '11aab317-9a1c-401e-acdf-5b373ed3222c'
const productsBannerCategoryId = 'eecb0550-9eeb-41ed-b48d-9da43948650c'
const foodCategoryId = 'ab4bbb55-f14e-4df3-a039-0547104229d3'
const characterCategoryId = '4ac87021-da4e-4470-9ab9-b52772444655'
const productId = 'a2e77f31-f244-4607-b7d6-b58e3ff6de11'

const additionalBannerCategories = [
  { id: '317196c0-823a-4d92-975a-2671432b1af9', name: 'Toys', slug: 'toys', banner: '/neww%20banner%20image/toy-sunlit-backdrop.png' },
  { id: '7b53be05-f444-467c-90e4-be34b41008c3', name: 'Electronics', slug: 'electronics', banner: '/neww%20banner%20image/retro-tech-controller-popout-refined.png' },
  { id: 'd0ac9c7c-4226-43bd-b9d5-a89e320a7f7f', name: 'Household', slug: 'household', banner: '/images/new%20banner%20image%20size/Household.webp' },
  { id: '1b40c2c2-e570-441d-bf54-c466e1608eac', name: 'Industrial', slug: 'industrial', banner: '/images/new%20banner%20image%20size/Industrial.webp' },
  { id: 'f2fd31a1-5fee-45f0-95d1-fd87d8ddb1a0', name: '3d Printing', slug: '3d-printing', banner: '/images/new%20banner%20image%20size/3D%20Printing.webp' },
  { id: 'b7b73085-a662-4daa-ac90-d07b89976b3c', name: 'Assets / Props', slug: 'assets-props', banner: '/images/new%20banner%20image%20size/Assets%20%20Props.webp' },
  { id: '4ecdc1ea-68b4-4e08-93de-d8e2d34ec1ad', name: 'Interactive / WebAr', slug: 'interactive-webar', banner: '/images/new%20banner%20image%20size/AR%20Armchair%20Studio%20Showcase.webp?v=2' },
  { id: 'e673b81b-2bc8-4f83-8dfc-081b9812a525', name: 'Architectural 3D Models', slug: 'architectural-3d-models', banner: '/images/new%20banner%20image%20size/Architectural%203D%20Models.webp' },
  { id: 'bc9bac17-4585-4c7c-95f1-34791f081d54', name: 'Interior 3D Models', slug: 'interior-3d-models', banner: '/images/new%20banner%20image%20size/Cinematic%20Floating%20Pavilion%20Interior.webp' },
  { id: 'e1404a6f-57d0-4828-982a-c4b7c781492a', name: 'Cloth Items', slug: 'cloth-items', banner: '/images/new%20banner%20image%20size/Cloth%20Items.webp' },
  { id: 'd3de2c3d-3672-4655-a653-39b68c705ace', name: 'Lights', slug: 'lights', banner: '/images/new%20banner%20image%20size/Moody%20Modern%20Lighting%20Vignette.webp' },
  { id: '851a9576-3864-4231-a1e6-305deb54ecd7', name: 'Plants / Vegetation', slug: 'plants-vegetation', banner: '/images/new%20banner%20image%20size/Moody%20Panoramic%20Indoor%20Plant%20Collection.webp' },
  { id: 'fc78161b-0d3e-477b-ad33-4d859dcfd358', name: 'LifeStyle / Visualisation', slug: 'lifestyle-visualisation', banner: '/images/new%20banner%20image%20size/Moody%20Minimalist%20Sofa%20Nook.webp' },
]

const samplePublicProducts = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: productId,
      name: 'Oak Chair',
      slug: 'oak-chair',
      short_description: 'A wooden chair',
      price: '29.99',
      currency: 'USD',
      discount_price: '19.99',
      thumbnail: '',
      software_used: 'Blender 4.x',
      formats: ['blend'],
      license_type: 'standard' as const,
      average_rating: '4.90',
      review_count: 0,
      total_downloads: 340,
      category: {
        id: categoryId,
        name: 'Furniture',
        slug: 'furniture',
        description: '',
        image: '',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
}

const sampleCategories = {
  count: 3 + additionalBannerCategories.length,
  next: null,
  previous: null,
  results: [
    {
      id: categoryId,
      name: 'Furniture',
      slug: 'furniture',
      description: 'Home and office furniture',
      image: '',
      parent: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: foodCategoryId,
      name: 'Food & Drink',
      slug: 'food-drink',
      description: 'Food and drink models',
      image: '',
      parent: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: characterCategoryId,
      name: 'Character',
      slug: 'character',
      description: 'Character models',
      image: '',
      parent: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    ...additionalBannerCategories.map(({ banner: _banner, ...category }) => ({
      ...category,
      description: `${category.name} models`,
      image: '',
      parent: null,
      created_at: '2026-01-01T00:00:00Z',
    })),
  ],
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

function renderModelsBrowsePage(initialPath = '/3d-models') {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <LocationProbe />
        <Routes>
          <Route path="/3d-models" element={<ModelsBrowsePage />} />
          <Route path="/3d-models/:categorySlug" element={<ModelsBrowsePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(productsApi.listPublicProducts).mockResolvedValue(samplePublicProducts)
  vi.mocked(productsApi.getPublicProduct).mockResolvedValue({
    ...samplePublicProducts.results[0],
    description: '', preview_model: '', preview_video: '', polygon_count: null, vertex_count: null,
    animated: false, rigged: false, pbr_ready: false, game_ready: false,
    images: [], updated_at: '2026-01-01T00:00:00Z',
    files: [{ id: 'file-1', file_name: 'chair.blend', file_format: 'blend', file_size: 100, version: '1', is_preview: false }],
  })
  vi.mocked(categoriesApi.listPublicCategories).mockResolvedValue(sampleCategories)
})

describe('ModelsBrowsePage', () => {
  it('renders hero title and product list', async () => {
    renderModelsBrowsePage()

    expect(
      screen.getByRole('heading', { level: 1, name: '3D Models for Furniture, Interiors & Visualization' }),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Oak Chair')).toBeInTheDocument()
    })

    expect(screen.getAllByText('Furniture').length).toBeGreaterThan(0)
    expect(screen.getByText('$ 19.99')).toBeInTheDocument()
    expect(screen.getByText('$ 29.99')).toBeInTheDocument()
  })

  describe('readable category addresses', () => {
    it('loads the category named in the address and gives it its own heading, intro and title', async () => {
      renderModelsBrowsePage('/3d-models/furniture')

      expect(await screen.findByRole('heading', { level: 1, name: 'Furniture 3D Models' })).toBeInTheDocument()
      await waitFor(() => {
        expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
          expect.objectContaining({ category_id: categoryId }),
        )
      })
      expect(screen.getByText(/ready-to-use furniture 3D models for interior renders/i)).toBeInTheDocument()
      await waitFor(() => expect(document.title).toBe('Furniture 3D Models – Chairs, Sofas & Tables | AssetHive3D'))
      expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
        'content',
        expect.stringContaining('Furniture 3D models for interior design'),
      )
    })

    it('points the canonical link at the clean category address even when filters are added', async () => {
      renderModelsBrowsePage('/3d-models/furniture?formats=blend&ordering=price')

      await screen.findByRole('heading', { level: 1, name: 'Furniture 3D Models' })
      await waitFor(() => {
        expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
          'href',
          expect.stringMatching(/\/3d-models\/furniture$/),
        )
      })
    })

    it('describes the page for search engines with breadcrumbs and a product list', async () => {
      renderModelsBrowsePage('/3d-models/furniture')

      await screen.findByText('Oak Chair')
      await waitFor(() => {
        const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((node) =>
          [JSON.parse(node.textContent ?? '[]')].flat(),
        )
        const types = blocks.map((block) => block['@type'])
        expect(types).toContain('BreadcrumbList')
        expect(types).toContain('ItemList')
        const list = blocks.find((block) => block['@type'] === 'ItemList')
        expect(list.itemListElement[0].url).toMatch(/\/products\/oak-chair$/)
      })
    })

    it('redirects an old ?category=<id> link to the readable address and keeps other filters', async () => {
      renderModelsBrowsePage(`/3d-models?category=${categoryId}&ordering=price`)

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/3d-models/furniture?ordering=price')
      })
    })

    it('shows the not-found page for a category that does not exist', async () => {
      renderModelsBrowsePage('/3d-models/not-a-real-category')

      expect(await screen.findByRole('heading', { name: /page not found|not found/i })).toBeInTheDocument()
      expect(productsApi.listPublicProducts).not.toHaveBeenCalled()
    })

    it('waits for the category before loading products, so it never flashes the whole catalog', async () => {
      renderModelsBrowsePage('/3d-models/furniture')

      await waitFor(() => expect(productsApi.listPublicProducts).toHaveBeenCalled())
      expect(productsApi.listPublicProducts).not.toHaveBeenCalledWith(
        expect.objectContaining({ category_id: undefined }),
      )
    })

    it('moves to the category address when a category is chosen in the filter', async () => {
      const user = userEvent.setup()
      renderModelsBrowsePage()

      await screen.findByText('Oak Chair')
      await user.selectOptions(screen.getByLabelText(/category/i, { selector: 'select' }), categoryId)

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/3d-models/furniture'))
    })

    it('keeps placeholder categories out of search results', async () => {
      vi.mocked(categoriesApi.listPublicCategories).mockResolvedValue({
        ...sampleCategories,
        results: [
          ...sampleCategories.results,
          {
            id: 'demo-category-id', name: 'Demo Assets', slug: 'demo-assets', description: '', image: '',
            parent: null, created_at: '2026-01-01T00:00:00Z',
          },
        ],
      })
      renderModelsBrowsePage('/3d-models/demo-assets')

      await screen.findByRole('heading', { level: 1, name: 'Demo Assets 3D Models' })
      await waitFor(() => {
        expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
      })
    })

    it('shows the not-found page, which is never indexed, for a made-up category', async () => {
      renderModelsBrowsePage('/3d-models/not-a-real-category')

      await waitFor(() => {
        expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
      })
    })

    it('does not index a search results page, but lets crawlers follow its links', async () => {
      renderModelsBrowsePage('/3d-models?search=chair')

      await screen.findByRole('heading', { level: 1 })
      await waitFor(() => {
        expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
      })
    })

    it('does not index a category that has no models yet (a page with nothing on it)', async () => {
      vi.mocked(productsApi.listPublicProducts).mockResolvedValue({
        count: 0, next: null, previous: null, results: [],
      })
      renderModelsBrowsePage('/3d-models/furniture')

      await waitFor(() => {
        expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
      })
    })

    it('indexes a category that has models', async () => {
      renderModelsBrowsePage('/3d-models/furniture')

      await screen.findByText('Oak Chair')
      expect(document.querySelector('meta[name="robots"]')).toBeNull()
    })
  })

  it('filters models by category selection', async () => {
    const user = userEvent.setup()
    renderModelsBrowsePage()

    await waitFor(() => {
      expect(screen.getByText('Oak Chair')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText(/category/i, { selector: 'select' }), categoryId)

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: categoryId }),
      )
    })
  })

  it('applies category filter from URL query string', async () => {
    const { container } = renderModelsBrowsePage(`/3d-models?category=${encodeURIComponent(categoryId)}`)

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: categoryId }),
      )
    })

    await waitFor(() => {
      expect(container.querySelector('.site-hero-banner__image')).toHaveAttribute(
        'src',
        '/banner%20image/08.webp',
      )
    })

    await waitFor(() => {
      expect(screen.getByLabelText(/^category$/i, { selector: 'select' })).toHaveValue(categoryId)
    })
  })

  it('uses the products banner for its assigned category URL', async () => {
    const { container } = renderModelsBrowsePage(
      `/3d-models?category=${productsBannerCategoryId}`,
    )

    await waitFor(() => {
      expect(container.querySelector('.site-hero-banner__image')).toHaveAttribute(
        'src',
        '/images/new%20banner%20image%20size/Moody%20Luxury%20Skincare%20Collection.webp',
      )
    })

    expect(container.querySelector('.site-hero-banner')).toHaveClass(
      'plugins-browse-hero--products',
    )
  })

  it('uses the food banner for the Food & Drink category', async () => {
    const { container } = renderModelsBrowsePage(`/3d-models?category=${foodCategoryId}`)

    await waitFor(() => {
      expect(container.querySelector('.site-hero-banner__image')).toHaveAttribute(
        'src',
        '/images/new%20banner%20image%20size/Food%20&%20Drink.webp',
      )
    })
  })

  it('uses the character banner for the Character category', async () => {
    const { container } = renderModelsBrowsePage(
      `/3d-models?category=${characterCategoryId}`,
    )

    await waitFor(() => {
      expect(container.querySelector('.site-hero-banner__image')).toHaveAttribute(
        'src',
        '/images/new%20banner%20image%20size/Character.webp',
      )
    })

    expect(container.querySelector('.site-hero-banner')).toHaveClass(
      'plugins-browse-hero--character',
    )
  })

  it.each(additionalBannerCategories)(
    'uses the assigned banner for the $name category',
    async ({ id, banner, slug }) => {
      const { container } = renderModelsBrowsePage(`/3d-models?category=${id}`)

      await waitFor(() => {
        expect(container.querySelector('.site-hero-banner__image')).toHaveAttribute(
          'src',
          banner,
        )
      })
      const popout = container.querySelector('.toys-banner__popout')
      if (slug === 'toys') {
        expect(popout).toHaveAttribute('aria-hidden', 'true')
        expect(popout?.querySelector('img')).toHaveAttribute('src', '/neww%20banner%20image/toy-vehicles-trio.png')
      } else {
        expect(popout).not.toBeInTheDocument()
      }
    },
  )

  it('capitalizes 3D in the 3D Printing banner title', async () => {
    renderModelsBrowsePage('/3d-models?category=f2fd31a1-5fee-45f0-95d1-fd87d8ddb1a0')

    expect(
      await screen.findByRole('heading', { name: '3D Printing Models' }),
    ).toBeInTheDocument()
  })

  it('applies format checkbox filter', async () => {
    const user = userEvent.setup()
    renderModelsBrowsePage()

    await waitFor(() => {
      expect(screen.getByText('Oak Chair')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('checkbox', { name: /blender/i }))

    expect(screen.getByText('Oak Chair')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /blender/i }))
    await user.click(screen.getByRole('checkbox', { name: /unity/i }))
    expect(screen.getByRole('heading', { name: /no 3d models found/i })).toBeInTheDocument()
    expect(productsApi.getPublicProduct).not.toHaveBeenCalled()
  })

  it('preserves legacy trait URLs while applying a license filter', async () => {
    const user = userEvent.setup()
    renderModelsBrowsePage('/3d-models?rigged=1')

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({ rigged: true }),
      )
    })

    await user.click(screen.getByRole('checkbox', { name: /extended license/i }))

    await waitFor(() => expect(screen.getByRole('heading', { name: /no 3d models found/i })).toBeInTheDocument())
    expect(productsApi.listPublicProducts).toHaveBeenLastCalledWith(expect.objectContaining({ rigged: true }))
  })

  it('restores price and format filters from the URL and clears them', async () => {
    const user = userEvent.setup()
    renderModelsBrowsePage('/3d-models?formats=blend&licenses=standard&min_price=10&max_price=100')
    await waitFor(() => expect(screen.getByText('Oak Chair')).toBeInTheDocument())
    expect(screen.getByRole('checkbox', { name: /blender/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /standard license/i })).toBeChecked()
    expect(screen.getByRole('slider', { name: 'Minimum price' })).toHaveValue('10')
    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(screen.getByRole('checkbox', { name: /blender/i })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /standard license/i })).not.toBeChecked()
    for (const [params] of vi.mocked(productsApi.listPublicProducts).mock.calls) {
      for (const key of ['formats', 'licenses', 'min_price', 'max_price', 'include_facets']) {
        expect(params).not.toHaveProperty(key)
      }
    }
    expect(screen.getByRole('slider', { name: 'Maximum price' })).toHaveValue('200')
  })

  it('filters across API pages using discounted prices', async () => {
    vi.mocked(productsApi.listPublicProducts)
      .mockResolvedValueOnce({ ...samplePublicProducts, count: 2, next: '/api/v1/products/?page=2', results: [{ ...samplePublicProducts.results[0], id: 'expensive', price: '300', discount_price: null, name: 'Expensive Chair' }] })
      .mockResolvedValueOnce({ ...samplePublicProducts, count: 2 })
    renderModelsBrowsePage('/3d-models?min_price=10&max_price=20')
    await waitFor(() => expect(screen.getByText('Oak Chair')).toBeInTheDocument())
    expect(screen.queryByText('Expensive Chair')).not.toBeInTheDocument()
    expect(screen.getByText('3D model')).toBeInTheDocument()
    expect(productsApi.listPublicProducts).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('sorts models by price low to high', async () => {
    const user = userEvent.setup()
    renderModelsBrowsePage()

    await waitFor(() => {
      expect(screen.getByText('Oak Chair')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText(/sort by/i), 'price')

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({ ordering: 'price' }),
      )
    })
  })

  it('applies ordering from the URL query', async () => {
    renderModelsBrowsePage('/3d-models?ordering=-total_downloads')

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({ ordering: '-total_downloads' }),
      )
    })
  })

  it('shows empty state when no models match filters', async () => {
    vi.mocked(productsApi.listPublicProducts).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    renderModelsBrowsePage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /no 3d models found/i })).toBeInTheDocument()
    })
  })

  it('shows error state and retry button on API failure', async () => {
    vi.mocked(productsApi.listPublicProducts).mockRejectedValue(new Error('Network error'))

    renderModelsBrowsePage()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /failed to load 3d models/i }),
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('shows clear filters button when filters are active', async () => {
    vi.mocked(productsApi.listPublicProducts).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    renderModelsBrowsePage(`/3d-models?category=${encodeURIComponent(categoryId)}`)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /no 3d models found/i })).toBeInTheDocument()
    })

    expect(screen.getAllByRole('button', { name: /clear filters/i }).length).toBeGreaterThan(0)
  })
})
