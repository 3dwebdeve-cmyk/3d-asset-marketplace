import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as categoriesApi from '../../api/categoriesApi'
import * as productsApi from '../../api/productsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import type { AdminProduct } from '../../types/product'
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
    approveAdminProduct: vi.fn(),
    rejectAdminProduct: vi.fn(),
    requeueAdminProduct: vi.fn(),
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

const sampleProduct: AdminProduct = {
  id: productId,
  name: 'Oak Chair',
  slug: 'oak-chair',
  sku: 'MDL-000142',
  import_batch_id: '',
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
  software_used: 'Blender',
  animated: false,
  rigged: false,
  pbr_ready: true,
  game_ready: false,
  license_type: 'standard',
  average_rating: '0.00',
  review_count: 0,
  total_downloads: 0,
  status: 'draft',
  reject_reason: '',
  qa_notes: '',
  reviewed_at: null,
  reviewed_by: null,
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

  it('shows Approve and Reject for pending_review products', async () => {
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'pending_review',
      import_batch_id: 'batch-1',
    })

    renderProductDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /import qa/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^requeue$/i })).not.toBeInTheDocument()
  })

  it('requires a reject reason before calling reject', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'pending_review',
    })

    renderProductDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^reject$/i }))

    expect(screen.getByText(/reject reason is required/i)).toBeInTheDocument()
    expect(productsApi.rejectAdminProduct).not.toHaveBeenCalled()
  })

  it('rejects with reason via the reject endpoint', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'pending_review',
    })
    vi.mocked(productsApi.rejectAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'rejected',
      reject_reason: 'Missing package',
    })

    renderProductDetailPage()

    await waitFor(() => {
      expect(screen.getByLabelText(/reject reason/i)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/reject reason/i), 'Missing package')
    await user.click(screen.getByRole('button', { name: /^reject$/i }))

    await waitFor(() => {
      expect(productsApi.rejectAdminProduct).toHaveBeenCalledWith(productId, {
        reason: 'Missing package',
      })
    })
  })

  it('shows Requeue for rejected products', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'rejected',
      reject_reason: 'Bad preview',
      qa_notes: 'Fix GLB',
      reviewed_at: '2026-09-07T10:00:00Z',
      reviewed_by: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    })
    vi.mocked(productsApi.requeueAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'pending_review',
      reject_reason: 'Bad preview',
    })

    renderProductDetailPage()

    await waitFor(() => {
      expect(screen.getByText(/reject reason: bad preview/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/qa notes: fix glb/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^requeue$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^requeue$/i }))

    await waitFor(() => {
      expect(productsApi.requeueAdminProduct).toHaveBeenCalledWith(productId)
    })
  })

  it('approves pending_review products via the approve endpoint', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'pending_review',
    })
    vi.mocked(productsApi.approveAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'published',
    })

    renderProductDetailPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^approve$/i }))

    await waitFor(() => {
      expect(productsApi.approveAdminProduct).toHaveBeenCalledWith(productId)
    })
  })
})
