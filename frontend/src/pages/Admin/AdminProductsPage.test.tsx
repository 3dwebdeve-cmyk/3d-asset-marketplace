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
    bulkDeleteAdminProducts: vi.fn(),
    restoreAdminProduct: vi.fn(),
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
          <Route path="/console/products" element={<AdminProductsPage key="products" />} />
          <Route path="/console/archived" element={<AdminProductsPage key="archived" archived />} />
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
  it('restores an archived row into Products as a Draft', async () => {
    const archivedProduct = { ...sampleProducts.results[0], status: 'archived' as const }
    const draftProduct = { ...archivedProduct, status: 'draft' as const }
    vi.mocked(productsApi.listAdminProducts).mockResolvedValue({ ...sampleProducts, results: [archivedProduct] })
    vi.mocked(productsApi.restoreAdminProduct).mockImplementation(async () => {
      vi.mocked(productsApi.listAdminProducts).mockImplementation(async (params) =>
        params?.status === 'archived'
          ? { ...sampleProducts, count: 0, results: [] }
          : { ...sampleProducts, results: [draftProduct] },
      )
      return draftProduct
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderProductsPage('/console/archived')
    await userEvent.click(await screen.findByRole('button', { name: 'Restore to Products' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('as a Draft'))
    expect(productsApi.restoreAdminProduct).toHaveBeenCalledWith(productId)
    await waitFor(() => expect(screen.queryByText('Oak Chair')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('link', { name: 'Back to products' }))
    expect(await screen.findByText('Oak Chair')).toBeInTheDocument()
    expect(screen.getByText('draft')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore to Products' })).not.toBeInTheDocument()
  })

  it('keeps the product archived when restoration is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderProductsPage('/console/archived')
    await userEvent.click(await screen.findByRole('button', { name: 'Restore to Products' }))
    expect(productsApi.restoreAdminProduct).not.toHaveBeenCalled()
    expect(screen.getByText('Oak Chair')).toBeInTheDocument()
  })

  it('reports a failed restore without removing the archived row', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(productsApi.restoreAdminProduct).mockRejectedValue(new Error('Failed'))
    renderProductsPage('/console/archived')
    await userEvent.click(await screen.findByRole('button', { name: 'Restore to Products' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not restore product. Please try again.')
    expect(screen.getByText('Oak Chair')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore to Products' })).toBeEnabled()
  })

  it('moves a deleted row into Archived and hides deletion controls there', async () => {
    const archivedProduct = { ...sampleProducts.results[0], status: 'archived' as const }
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(productsApi.bulkDeleteAdminProducts).mockImplementation(async () => {
      vi.mocked(productsApi.listAdminProducts).mockImplementation(async (params) =>
        params?.status === 'archived'
          ? { ...sampleProducts, results: [archivedProduct] }
          : { ...sampleProducts, count: 0, results: [] },
      )
      return { deleted: [], archived: [productId], not_found: [] }
    })
    renderProductsPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Oak Chair' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('move it to Archived'))
    await waitFor(() => expect(screen.queryByText('Oak Chair')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('link', { name: 'View archived products' }))
    expect(await screen.findByRole('heading', { name: 'Archived products' })).toBeInTheDocument()
    expect(await screen.findByText('Oak Chair')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', `/console/archived/${productId}`)
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create product/i })).not.toBeInTheDocument()
  })

  it('restricts archive search and batch filters to archived products', async () => {
    renderProductsPage('/console/archived?status=published&import_batch_id=batch-1')
    await userEvent.type(screen.getByLabelText('Search products'), 'chair')
    await waitFor(() => expect(productsApi.listAdminProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'archived', search: 'chair', import_batch_id: 'batch-1' }),
    ))
    expect(screen.queryByRole('combobox', { name: 'Filter by status' })).not.toBeInTheDocument()
  })

  it('redirects old archived bookmarks to the Archived section', async () => {
    renderProductsPage('/console/products?status=archived&import_batch_id=batch-2')
    expect(await screen.findByRole('heading', { name: 'Archived products' })).toBeInTheDocument()
    await waitFor(() => expect(productsApi.listAdminProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'archived', import_batch_id: 'batch-2' }),
    ))
  })

  it('deletes the selected products after confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(productsApi.bulkDeleteAdminProducts).mockResolvedValue({
      deleted: [],
      archived: [productId],
      not_found: [],
    })
    renderProductsPage()

    const deleteSelected = await screen.findByRole('button', { name: /delete selected \(0\)/i }, { timeout: 5000 })
    expect(deleteSelected).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /select all products/i }))
    await user.click(screen.getByRole('button', { name: /delete selected \(1\)/i }))

    await waitFor(() => {
      expect(productsApi.bulkDeleteAdminProducts).toHaveBeenCalledWith([productId])
    })
  })

  it('deletes one product from its row and keeps it when not confirmed', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderProductsPage()

    await user.click(await screen.findByRole('button', { name: /delete oak chair/i }, { timeout: 5000 }))
    expect(productsApi.bulkDeleteAdminProducts).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    vi.mocked(productsApi.bulkDeleteAdminProducts).mockResolvedValue({
      deleted: [],
      archived: [productId],
      not_found: [],
    })
    await user.click(screen.getByRole('button', { name: /delete oak chair/i }))
    await waitFor(() => {
      expect(productsApi.bulkDeleteAdminProducts).toHaveBeenCalledWith([productId])
    })
  })

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
