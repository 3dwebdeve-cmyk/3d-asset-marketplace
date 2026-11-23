import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
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
    listUploaderImports: vi.fn(),
    restoreAdminProduct: vi.fn(),
    purgeAdminProduct: vi.fn(),
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
      category: { id: categoryId, name: 'Furniture', slug: 'furniture', code: null, is_active: true, pending_approval: false, rejected_at: null },
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
      code: null, pending_approval: false, created_by_import: false, created_from_batch: '', rejected_at: null, product_count: 0,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ],
}

function renderProductsPage(
  initialEntry = '/console/products',
  queryClient: QueryClient = createTestQueryClient(),
) {
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
  vi.mocked(productsApi.listUploaderImports).mockResolvedValue([])
})

describe('AdminProductsPage', () => {
  it('filters products by folder and changes rows per page', async () => {
    renderProductsPage()
    await userEvent.click(await screen.findByRole('button', { name: /^Furniture/ }))
    await waitFor(() => expect(productsApi.listAdminProducts).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: categoryId, page: 1, page_size: 10 }),
    ))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '25')
    await waitFor(() => expect(productsApi.listAdminProducts).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: categoryId, page: 1, page_size: 25 }),
    ))
  })

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

  it('deletes an archived row permanently after confirmation', async () => {
    const archivedProduct = { ...sampleProducts.results[0], status: 'archived' as const }
    vi.mocked(productsApi.listAdminProducts).mockResolvedValue({ ...sampleProducts, results: [archivedProduct] })
    vi.mocked(productsApi.purgeAdminProduct).mockImplementation(async () => {
      vi.mocked(productsApi.listAdminProducts).mockResolvedValue({ ...sampleProducts, count: 0, results: [] })
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderProductsPage('/console/archived')
    const button = await screen.findByRole('button', { name: 'Delete Oak Chair permanently' })
    expect(button).toHaveTextContent('Delete')
    await userEvent.click(button)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('cannot be undone'))
    expect(productsApi.purgeAdminProduct).toHaveBeenCalledWith(productId)
    await waitFor(() => expect(screen.queryByText('Oak Chair')).not.toBeInTheDocument())
  })

  it('keeps the archived row when the permanent delete is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderProductsPage('/console/archived')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Oak Chair permanently' }))
    expect(productsApi.purgeAdminProduct).not.toHaveBeenCalled()
    expect(screen.getByText('Oak Chair')).toBeInTheDocument()
  })

  it('reports a refused permanent delete and keeps the archived row', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(productsApi.purgeAdminProduct).mockRejectedValue(new Error('Failed'))
    renderProductsPage('/console/archived')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Oak Chair permanently' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the model. Please try again.')
    expect(screen.getByText('Oak Chair')).toBeInTheDocument()
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
    // No archive-again controls; the only delete there is the permanent one.
    expect(screen.queryByRole('button', { name: /delete selected/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Oak Chair' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Oak Chair permanently' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create product/i })).not.toBeInTheDocument()
  })

  it('restricts archive search and batch filters to archived products', async () => {
    renderProductsPage('/console/archived?status=published&import_batch_id=batch-1')
    await userEvent.type(screen.getByLabelText('Search products'), 'chair')
    await waitFor(() => expect(productsApi.listAdminProducts).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archived', search: 'chair', import_batch_id: 'batch-1' }),
    ))
    expect(screen.queryByRole('combobox', { name: 'Filter by status' })).not.toBeInTheDocument()
  })

  it('redirects old archived bookmarks to the Archived section', async () => {
    renderProductsPage('/console/products?status=archived&import_batch_id=batch-2')
    expect(await screen.findByRole('heading', { name: 'Archived products' })).toBeInTheDocument()
    await waitFor(() => expect(productsApi.listAdminProducts).toHaveBeenCalledWith(
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
    expect(screen.getByText('pending review')).toBeInTheDocument()
    expect(screen.getByText('2026-09-03-run-01')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /manage/i })).toHaveAttribute(
      'href',
      `/console/products/${productId}`,
    )
  })

  it('labels awaiting_price as Waiting for price in the list and offers it as a filter', async () => {
    vi.mocked(productsApi.listAdminProducts).mockResolvedValue({
      ...sampleProducts,
      results: [{ ...sampleProducts.results[0], status: 'awaiting_price' }],
    } as unknown as typeof sampleProducts)
    renderProductsPage('/console/products?status=awaiting_price')

    await waitFor(() => {
      expect(productsApi.listAdminProducts).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'awaiting_price' }),
      )
    })
    const filter = screen.getByLabelText('Filter by status') as HTMLSelectElement
    expect(within(filter).getByRole('option', { name: 'Waiting for price' })).toHaveValue('awaiting_price')
    expect(filter.value).toBe('awaiting_price')
    expect(await screen.findAllByText('Waiting for price')).not.toHaveLength(0)
    expect(screen.queryByText('awaiting price')).not.toBeInTheDocument()
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

  it('shows why uploaded models did not reach the QA queue', async () => {
    vi.mocked(productsApi.listUploaderImports).mockResolvedValue([
      {
        id: 'log-1',
        import_batch_id: 'uploader-20261030-001',
        created_at: '2026-10-30T06:29:55Z',
        created: 2,
        updated: 0,
        skipped: 1,
        failed: 0,
        refused: [
          {
            model_id: 'OUT-000003',
            name: 'Garden Bench',
            reason: 'category_unmapped',
            text: 'No category has the code of this ID.',
            action: 'Set the code on the right category.',
          },
        ],
      },
    ])
    renderProductsPage('/console/products?status=pending_review')

    expect(await screen.findByRole('heading', { name: 'Recent uploader imports' })).toBeInTheDocument()
    expect(screen.getByText(/2 new, 0 updated to QA, 1 not imported/)).toBeInTheDocument()
    const refused = screen.getByText('OUT-000003').closest('li')
    expect(refused).toHaveTextContent(
      'OUT-000003 (Garden Bench): No category has the code of this ID. Next step: Set the code on the right category.',
    )
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
    // No price here: packages are priced on the Pricing page.
    expect(screen.queryByLabelText(/price/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^create product$/i }))

    await waitFor(() => {
      expect(productsApi.createAdminProduct).toHaveBeenCalled()
    })
    const payload = vi.mocked(productsApi.createAdminProduct).mock.calls[0]?.[0]
    expect(payload).toMatchObject({ category_id: categoryId, name: 'Glass Table' })
    expect(payload).not.toHaveProperty('price')
    await waitFor(() => {
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
    })
  })
})

describe('AdminProductsPage QA sections', () => {
  it('splits the QA queue into Free and Paid sections with counts and labels', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.listAdminProducts).mockImplementation(async (params) => {
      if (params?.page_size === 1 && params.kind) {
        return { ...sampleProducts, count: params.kind === 'free' ? 3 : 5, results: [] }
      }
      const kind = params?.kind ?? 'paid'
      return {
        ...sampleProducts,
        results: [{ ...sampleProducts.results[0], status: 'pending_review' as const, upload_kind: kind }],
      }
    })
    renderProductsPage('/console/products?status=pending_review')

    const free = await screen.findByRole('tab', { name: /free models/i })
    expect(free).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(within(free).getByText('3')).toBeInTheDocument())
    expect(within(screen.getByRole('tab', { name: /paid models/i })).getByText('5')).toBeInTheDocument()
    await waitFor(() =>
      expect(productsApi.listAdminProducts).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending_review', kind: 'free', page: 1 }),
      ),
    )
    expect(await screen.findByText('Free', { selector: '.admin-kind-badge' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /paid models/i }))

    await waitFor(() =>
      expect(productsApi.listAdminProducts).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending_review', kind: 'paid', page: 1 }),
      ),
    )
    expect(await screen.findByText('Paid', { selector: '.admin-kind-badge' })).toBeInTheDocument()
    expect(screen.getByText(/sends it to the pricing page/i)).toBeInTheDocument()
  })

  it('shows no sections outside the QA queue', async () => {
    renderProductsPage('/console/products')
    expect(await screen.findByText('Oak Chair')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /free models/i })).not.toBeInTheDocument()
  })
})

describe('AdminProductsPage QA queue stays current', () => {
  // The console's own cache settings (src/main.tsx). The default test client keeps nothing,
  // so it could not show a stale QA queue.
  const appQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: { staleTime: 60_000, gcTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false },
      },
    })
  const uploadedModel = {
    ...sampleProducts.results[0],
    name: 'Banana Cluster',
    status: 'pending_review' as const,
    upload_kind: 'free' as const,
  }
  let uploaded = false

  beforeEach(() => {
    uploaded = false
    // The uploader program adds a free model to QA; nothing else is in the catalog.
    vi.mocked(productsApi.listAdminProducts).mockImplementation(async (params) => {
      const listed =
        uploaded &&
        (!params?.status || params.status === 'pending_review') &&
        params?.kind !== 'paid'
      const rows = listed ? [uploadedModel] : []
      return { ...sampleProducts, count: rows.length, results: params?.page_size === 1 ? [] : rows }
    })
  })

  const freeTabCount = async (count: string) => {
    const free = await screen.findByRole('tab', { name: /free models/i })
    await waitFor(() => expect(within(free).getByText(count)).toBeInTheDocument())
  }

  it('shows the upload when switching back from All current statuses', async () => {
    const user = userEvent.setup()
    renderProductsPage('/console/products?status=pending_review', appQueryClient())
    await freeTabCount('0')

    uploaded = true
    const statusFilter = screen.getByRole('combobox', { name: /filter by status/i })
    await user.selectOptions(statusFilter, '')
    expect(await screen.findByText('Banana Cluster')).toBeInTheDocument()

    await user.selectOptions(statusFilter, 'pending_review')

    await freeTabCount('1')
    expect(await screen.findByText('Banana Cluster')).toBeInTheDocument()
  })

  it('checks an open QA queue for new uploads every 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      renderProductsPage('/console/products?status=pending_review', appQueryClient())
      await freeTabCount('0')

      uploaded = true
      await act(() => vi.advanceTimersByTimeAsync(30_000))

      await freeTabCount('1')
      expect(await screen.findByText('Banana Cluster')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('checks again when the admin comes back to the window', async () => {
    renderProductsPage('/console/products?status=pending_review', appQueryClient())
    await freeTabCount('0')

    uploaded = true
    try {
      act(() => {
        focusManager.setFocused(false)
        focusManager.setFocused(true)
      })

      expect(await screen.findByText('Banana Cluster')).toBeInTheDocument()
      await freeTabCount('1')
    } finally {
      focusManager.setFocused(undefined)
    }
  })
})
