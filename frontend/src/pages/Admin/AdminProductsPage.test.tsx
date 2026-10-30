import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as categoriesApi from '../../api/categoriesApi'
import * as productsApi from '../../api/productsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminProductsPage } from './AdminProductsPage'

vi.mock('../../api/productsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/productsApi')>(
    '../../api/productsApi',
  )
  return {
    ...actual,
    listAdminProducts: vi.fn(),
    createAdminProduct: vi.fn(),
  }
})

vi.mock('../../api/categoriesApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/categoriesApi')>(
    '../../api/categoriesApi',
  )
  return {
    ...actual,
    listAdminCategories: vi.fn(),
  }
})

const categoryId = '44bba207-8a0c-490d-abdf-5a383ed2111b'
const productId = 'b3d66e20-e133-4506-a6c5-a47d2ee5cd00'

const sampleProducts = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: productId,
      name: 'Oak Chair',
      slug: 'oak-chair',
      sku: 'MDL-000142',
      import_batch_id: '2026-09-03-run-01',
      import_source: '',
      glb_checksum: '',
      has_thumbnail: false,
      has_preview: false,
      has_package: false,
      description: 'A wooden chair',
      short_description: 'Wooden chair',
      price: '29.99',
      currency: 'USD',
      discount_price: null,
      thumbnail: '',
      preview_model: '',
      preview_video: '',
      polygon_count: null,
      vertex_count: null,
      software_used: '',
      animated: false,
      rigged: false,
      pbr_ready: false,
      game_ready: false,
      license_type: 'standard' as const,
      average_rating: '0.00',
      review_count: 0,
      total_downloads: 0,
      status: 'pending_review' as const,
      reject_reason: '',
      qa_notes: '',
      reviewed_at: null,
      reviewed_by: null,
      category: { id: categoryId, name: 'Furniture', slug: 'furniture' },
      images: [],
      files: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
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
      description: '',
      image: '',
      parent: null,
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ],
}

function renderProductsPage(initialEntry = '/console/products') {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/console/products" element={<AdminProductsPage />} />
          <Route path="/console" element={<div>Admin Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  vi.mocked(productsApi.listAdminProducts).mockResolvedValue(sampleProducts)
  vi.mocked(categoriesApi.listAdminCategories).mockResolvedValue(sampleCategories)
})

describe('AdminProductsPage', () => {
  it('renders product list', async () => {
    renderProductsPage()

    expect(screen.getByRole('heading', { name: /products/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Oak Chair')).toBeInTheDocument()
    })
    expect(screen.getByText('MDL-000142')).toBeInTheDocument()
    expect(screen.getByText('pending_review')).toBeInTheDocument()
    expect(screen.getByText('2026-09-03-run-01')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /manage/i })).toHaveAttribute(
      'href',
      `/console/products/${productId}`,
    )
  })

  it('filters by pending_review from the QA queue URL', async () => {
    renderProductsPage('/console/products?status=pending_review')

    await waitFor(() => {
      expect(productsApi.listAdminProducts).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending_review' }),
      )
    })
    expect(screen.getByRole('heading', { name: /qa queue/i })).toBeInTheDocument()
  })

  it('filters by import_batch_id', async () => {
    const user = userEvent.setup()
    renderProductsPage()

    await waitFor(() => {
      expect(screen.getByText('Oak Chair')).toBeInTheDocument()
    })

    await user.type(
      screen.getByLabelText(/filter by import batch id/i),
      '2026-09-03-run-01',
    )
    await user.click(screen.getByRole('button', { name: /filter batch/i }))

    await waitFor(() => {
      expect(productsApi.listAdminProducts).toHaveBeenCalledWith(
        expect.objectContaining({ import_batch_id: '2026-09-03-run-01' }),
      )
    })
  })

  it('creates a product from the inline form', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.createAdminProduct).mockResolvedValue(sampleProducts.results[0])

    renderProductsPage()

    await user.click(screen.getByRole('button', { name: /create product/i }))
    await user.selectOptions(screen.getByLabelText(/^category$/i), categoryId)
    await user.type(screen.getByLabelText(/^name$/i), 'Glass Table')
    await user.type(screen.getByLabelText(/short description/i), 'Modern table')
    await user.type(screen.getByLabelText(/price/i), '120')
    await user.click(screen.getByRole('button', { name: /^create product$/i }))

    await waitFor(() => {
      expect(productsApi.createAdminProduct).toHaveBeenCalled()
    })
    expect(vi.mocked(productsApi.createAdminProduct).mock.calls[0]?.[0]).toMatchObject({
      category_id: categoryId,
      name: 'Glass Table',
      price: '120.00',
    })
    await waitFor(() => {
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
    })
  })
})
