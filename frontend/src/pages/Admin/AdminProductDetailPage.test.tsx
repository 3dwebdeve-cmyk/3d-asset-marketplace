import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
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
    bulkDeleteAdminProducts: vi.fn(),
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
      <MemoryRouter initialEntries={[`/console/products/${productId}`]}>
        <Routes>
          <Route path="/console/products/:productId" element={<AdminProductDetailPage />} />
          <Route path="/console/products" element={<div>Products list</div>} />
          <Route path="/console/archived" element={<div>Archived products list</div>} />
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
  it('moves a deleted product to Archived after explaining retained buyer downloads', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(productsApi.bulkDeleteAdminProducts).mockResolvedValue({ deleted: [], archived: [productId], not_found: [] })
    renderProductDetailPage()
    await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('move it to Archived'))
    expect(productsApi.bulkDeleteAdminProducts).toHaveBeenCalledWith([productId])
    expect(await screen.findByText('Products list')).toBeInTheDocument()
  })

  it('does not offer another deletion for an archived product', async () => {
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({ ...sampleProduct, status: 'archived' })
    renderProductDetailPage()
    expect(await screen.findByRole('button', { name: /^delete$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^archived$/i })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Back to archived products' })).toHaveAttribute('href', '/console/archived')
  })

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

  it('saves a product as free: price 0 and no discount', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.updateAdminProduct).mockResolvedValue({ ...sampleProduct, price: '0.00' })

    renderProductDetailPage()

    const pricing = await screen.findByRole('group', { name: /^pricing$/i })
    expect(screen.getByLabelText(/^price$/i)).toBeInTheDocument()
    await user.click(within(pricing).getByLabelText(/^free/i))
    expect(screen.queryByLabelText(/^price$/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(productsApi.updateAdminProduct).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({ price: '0.00', discount_price: null }),
      )
    })
  })

  it('needs a price to save a paid product', async () => {
    const user = userEvent.setup()
    renderProductDetailPage()

    await user.clear(await screen.findByLabelText(/^price$/i))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(screen.getByText(/enter a price above 0, or choose free/i)).toBeInTheDocument()
    expect(productsApi.updateAdminProduct).not.toHaveBeenCalled()
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
    const qaPricing = screen.getByRole('group', { name: /pricing when published/i })
    expect(within(qaPricing).getByLabelText(/^free/i)).toBeInTheDocument()
    expect(within(qaPricing).getByLabelText(/^paid/i)).toBeChecked()
    expect(screen.getByRole('button', { name: /approve & publish/i })).toBeInTheDocument()
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
      expect(screen.getByRole('button', { name: /approve & publish at usd 29\.99/i })).toBeInTheDocument()
    })

    await user.clear(screen.getByLabelText(/price \(usd\)/i))
    await user.type(screen.getByLabelText(/price \(usd\)/i), '45')
    await user.click(screen.getByRole('button', { name: /approve & publish/i }))

    await waitFor(() => {
      expect(productsApi.approveAdminProduct).toHaveBeenCalledWith(productId, {
        pricing: 'paid',
        price: '45.00',
      })
    })
  })

  it('publishes a product as a free download when Free is chosen', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'pending_review',
    })
    vi.mocked(productsApi.approveAdminProduct).mockResolvedValue({
      ...sampleProduct,
      price: '0.00',
      is_free: true,
      status: 'published',
    })

    renderProductDetailPage()

    const qaPricing = await screen.findByRole('group', { name: /pricing when published/i })
    await user.click(within(qaPricing).getByLabelText(/^free/i))
    expect(screen.queryByLabelText(/price \(usd\)/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /approve & publish as free/i }))

    await waitFor(() => {
      expect(productsApi.approveAdminProduct).toHaveBeenCalledWith(productId, { pricing: 'free' })
    })
  })

  it('refuses a paid approval without a price', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'pending_review',
    })

    renderProductDetailPage()

    await user.clear(await screen.findByLabelText(/price \(usd\)/i))
    await user.click(screen.getByRole('button', { name: /approve & publish/i }))

    expect(screen.getByText(/enter a price above 0/i)).toBeInTheDocument()
    expect(productsApi.approveAdminProduct).not.toHaveBeenCalled()
  })
})
