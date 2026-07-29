import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as categoriesApi from '../../api/categoriesApi'
import * as productsApi from '../../api/productsApi'
import { createTestQueryClient } from '../../test/test-utils'
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

const categoryId = '44bba207-8a0c-490d-abdf-5a383ed2111b'
const productId = 'b3d66e20-e133-4506-a6c5-a47d2ee5cd00'

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

function renderProductsBrowsePage(initialPath = '/products') {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/products" element={<ProductsBrowsePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(productsApi.listPublicProducts).mockResolvedValue(samplePublicProducts)
  vi.mocked(categoriesApi.listPublicCategories).mockResolvedValue(samplePublicCategories)
})

describe('ProductsBrowsePage', () => {
  it('renders hero title and products catalog', async () => {
    renderProductsBrowsePage()

    expect(
      screen.getByRole('heading', { name: /explore premium 3d models/i }),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk Drone 3D')).toBeInTheDocument()
    })

    expect(screen.getAllByText('Sci-Fi Assets').length).toBeGreaterThan(0)
    expect(screen.getByText('$39.99')).toBeInTheDocument()
    expect(screen.getByText('$49.99')).toBeInTheDocument()
  })

  it('filters products by category selection', async () => {
    const user = userEvent.setup()
    renderProductsBrowsePage()

    await waitFor(() => {
      expect(screen.getByText('Cyberpunk Drone 3D')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText(/category/i), categoryId)

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

  it('sorts products by price low to high', async () => {
    const user = userEvent.setup()
    renderProductsBrowsePage()

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

    renderProductsBrowsePage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /no 3d models found/i })).toBeInTheDocument()
    })
  })
})
