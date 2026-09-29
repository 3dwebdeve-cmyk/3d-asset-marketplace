import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
const productId = 'a2e77f31-f244-4607-b7d6-b58e3ff6de11'

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
  count: 1,
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
  ],
}

function renderModelsBrowsePage(initialPath = '/3d-models') {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/3d-models" element={<ModelsBrowsePage />} />
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

    expect(screen.getByRole('heading', { name: /^3d model$/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Oak Chair')).toBeInTheDocument()
    })

    expect(screen.getAllByText('Furniture').length).toBeGreaterThan(0)
    expect(screen.getByText('$ 19.99')).toBeInTheDocument()
    expect(screen.getByText('$ 29.99')).toBeInTheDocument()
  })

  it('filters models by category selection', async () => {
    const user = userEvent.setup()
    renderModelsBrowsePage()

    await waitFor(() => {
      expect(screen.getByText('Oak Chair')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText(/category/i), categoryId)

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: categoryId }),
      )
    })
  })

  it('applies category filter from URL query string', async () => {
    renderModelsBrowsePage(`/3d-models?category=${encodeURIComponent(categoryId)}`)

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: categoryId }),
      )
    })

    await waitFor(() => {
      expect(screen.getByLabelText(/^category$/i)).toHaveValue(categoryId)
    })
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
    await user.click(screen.getByRole('checkbox', { name: /unity package/i }))
    expect(screen.getByRole('heading', { name: /no 3d models found/i })).toBeInTheDocument()
    expect(productsApi.getPublicProduct).toHaveBeenCalledWith('oak-chair')
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
