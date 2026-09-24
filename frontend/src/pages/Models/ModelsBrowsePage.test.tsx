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

  it('applies software chip as search filter', async () => {
    const user = userEvent.setup()
    renderModelsBrowsePage()

    await waitFor(() => {
      expect(screen.getByText('Oak Chair')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^blender$/i }))

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Blender' }),
      )
    })
  })

  it('applies trait chip filter from URL and toggle', async () => {
    const user = userEvent.setup()
    renderModelsBrowsePage('/3d-models?rigged=1')

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({ rigged: true }),
      )
    })

    await user.click(screen.getByRole('button', { name: /^animated$/i }))

    await waitFor(() => {
      expect(productsApi.listPublicProducts).toHaveBeenCalledWith(
        expect.objectContaining({ rigged: true, animated: true }),
      )
    })
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
