import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as categoriesApi from '../../api/categoriesApi'
import * as productsApi from '../../api/productsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminProductDetailPage } from './AdminProductDetailPage'

vi.mock('../../api/productsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/productsApi')>(
    '../../api/productsApi',
  )
  return {
    ...actual,
    getAdminProduct: vi.fn(),
    listAdminCategories: vi.fn(),
    updateAdminProduct: vi.fn(),
    archiveAdminProduct: vi.fn(),
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

const productId = 'b3d66e20-e133-4506-a6c5-a47d2ee5cd00'
const categoryId = '44bba207-8a0c-490d-abdf-5a383ed2111b'

const sampleProduct = {
  id: productId,
  name: 'Oak Chair',
  slug: 'oak-chair',
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
  software_used: 'Blender',
  animated: false,
  rigged: false,
  pbr_ready: true,
  game_ready: false,
  license_type: 'standard' as const,
  average_rating: '0.00',
  total_downloads: 0,
  status: 'draft' as const,
  category: { id: categoryId, name: 'Furniture', slug: 'furniture' },
  images: [],
  files: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

function renderProductDetailPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/admin/products/${productId}`]}>
        <Routes>
          <Route path="/admin/products/:productId" element={<AdminProductDetailPage />} />
          <Route path="/admin" element={<div>Admin Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  vi.mocked(productsApi.getAdminProduct).mockResolvedValue(sampleProduct)
  vi.mocked(categoriesApi.listAdminCategories).mockResolvedValue({
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
  })
})

describe('AdminProductDetailPage', () => {
  it('loads product details into the form', async () => {
    renderProductDetailPage()

    await waitFor(() => {
      expect(screen.getByDisplayValue('Oak Chair')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('oak-chair')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Blender')).toBeInTheDocument()
    expect(screen.getByText(/images and model files/i)).toBeInTheDocument()
    expect(screen.getByText('USDZ')).toBeInTheDocument()
  })

  it('saves product updates', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.updateAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'published',
    })

    renderProductDetailPage()

    await waitFor(() => {
      expect(screen.getByDisplayValue('Oak Chair')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText(/^status$/i), 'published')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(productsApi.updateAdminProduct).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({ status: 'published' }),
      )
    })
    await waitFor(() => {
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
    })
  })
})
