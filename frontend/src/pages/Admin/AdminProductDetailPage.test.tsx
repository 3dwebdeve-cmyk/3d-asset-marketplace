import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as categoriesApi from '../../api/categoriesApi'
import * as productsApi from '../../api/productsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import type { AdminProduct } from '../../types/product'
import { useToastStore } from '../../store/toastStore'
import { AdminProductDetailPage, SALE_END_PAST_MESSAGE } from './AdminProductDetailPage'

vi.mock('../../api/productsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/productsApi')>(
    '../../api/productsApi',
  )
  return {
    ...actual,
    getAdminProduct: vi.fn(),
    getAdminProductFileCheck: vi.fn(),
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
  vi.mocked(productsApi.getAdminProductFileCheck).mockResolvedValue({
    total: 2,
    missing: 0,
    unknown: 0,
    files: [
      { role: 'thumbnail', label: 'Thumbnail', key: 'models/MDL-000142/thumb.jpg', bucket: 'public', status: 'found' },
      { role: 'package', label: 'Download (MDL-000142.zip)', key: 'models/MDL-000142/MDL-000142.zip', bucket: 'private', status: 'found' },
    ],
  })
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

describe('AdminProductDetailPage file check', () => {
  it('says every file is in storage when nothing is missing', async () => {
    renderProductDetailPage()

    expect(await screen.findByText('All 2 file(s) this product uses are in storage.')).toBeInTheDocument()
    expect(productsApi.getAdminProductFileCheck).toHaveBeenCalledWith(productId)
  })

  it('lists files missing in storage with their R2 path and bucket', async () => {
    vi.mocked(productsApi.getAdminProductFileCheck).mockResolvedValue({
      total: 3,
      missing: 2,
      unknown: 0,
      files: [
        { role: 'thumbnail', label: 'Thumbnail', key: 'models/MDL-000142/thumb.jpg', bucket: 'public', status: 'found' },
        { role: 'image', label: 'Image 2', key: 'models/MDL-000142/render_02.jpg', bucket: 'public', status: 'missing' },
        { role: 'package', label: 'Download (MDL-000142.zip)', key: 'models/MDL-000142/MDL-000142.zip', bucket: 'private', status: 'missing' },
      ],
    })

    renderProductDetailPage()

    const warning = await screen.findByRole('alert', { name: '2 file(s) missing in storage' })
    expect(within(warning).getByText('Image 2')).toBeInTheDocument()
    expect(within(warning).getByText('models/MDL-000142/render_02.jpg')).toBeInTheDocument()
    expect(within(warning).getByText('private bucket')).toBeInTheDocument()
    expect(within(warning).queryByText('Thumbnail')).not.toBeInTheDocument()
  })

  it('checks again on request', async () => {
    vi.mocked(productsApi.getAdminProductFileCheck).mockResolvedValue({
      total: 1,
      missing: 1,
      unknown: 0,
      files: [{ role: 'preview', label: '3D preview', key: 'models/MDL-000142/preview.glb', bucket: 'public', status: 'missing' }],
    })
    renderProductDetailPage()
    const warning = await screen.findByRole('alert', { name: '1 file(s) missing in storage' })

    await userEvent.click(within(warning).getByRole('button', { name: 'Check again' }))

    await waitFor(() => expect(productsApi.getAdminProductFileCheck).toHaveBeenCalledTimes(2))
  })

  it('marks a gallery image that did not load in the browser', async () => {
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      images: [
        { id: 'img-1', image_url: 'https://cdn.example.com/a.jpg', display_order: 0, is_primary: true, created_at: '2024-01-01T00:00:00Z' },
        { id: 'img-2', image_url: 'https://cdn.example.com/b.jpg', display_order: 1, is_primary: false, created_at: '2024-01-01T00:00:00Z' },
      ],
    })
    renderProductDetailPage()
    const gallery = await screen.findAllByRole('img', { name: 'Product gallery image' })

    fireEvent.error(gallery[0])

    const warning = await screen.findByRole('alert', { name: '1 image(s) did not load' })
    expect(within(warning).getByText(/Did not load in this browser: Image 2\./)).toBeInTheDocument()
    expect(screen.getByText('Did not load')).toBeInTheDocument()
  })
})

describe('AdminProductDetailPage live model update', () => {
  const liveUpdateProduct: AdminProduct = { ...sampleProduct, status: 'published', pending_update: true }

  it('approves the update without changing the price', async () => {
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue(liveUpdateProduct)
    vi.mocked(productsApi.approveAdminProduct).mockResolvedValue({ ...liveUpdateProduct, pending_update: false })
    renderProductDetailPage()

    expect(await screen.findByText('Update to a live model')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send to pricing|publish as free/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Approve update' }))

    await waitFor(() => expect(productsApi.approveAdminProduct).toHaveBeenCalledWith(productId))
  })

  it('rejects the update with a reason, taking the model off the store', async () => {
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue(liveUpdateProduct)
    vi.mocked(productsApi.rejectAdminProduct).mockResolvedValue({ ...liveUpdateProduct, status: 'rejected', pending_update: false })
    renderProductDetailPage()

    await userEvent.type(await screen.findByLabelText(/reject reason/i), 'Renders are broken')
    await userEvent.click(screen.getByRole('button', { name: 'Reject and take off the store' }))

    await waitFor(() =>
      expect(productsApi.rejectAdminProduct).toHaveBeenCalledWith(productId, { reason: 'Renders are broken' }),
    )
  })

  it('shows no review section for a live model without an update', async () => {
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({ ...sampleProduct, status: 'published' })
    renderProductDetailPage()

    expect(await screen.findByDisplayValue('Oak Chair')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /import qa/i })).not.toBeInTheDocument()
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

    await user.selectOptions(screen.getByLabelText(/^status$/i), 'rejected')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(productsApi.updateAdminProduct).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({ status: 'rejected' }),
      )
    })
    await waitFor(() => {
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
    })
  })

  it('shows the paid QA section: label, suggested price, one send-to-Pricing button, no price input', async () => {
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'pending_review',
      upload_kind: 'paid',
      import_batch_id: 'batch-1',
    })

    renderProductDetailPage()

    await screen.findByRole('heading', { name: /import qa/i })
    expect(screen.getByText('Paid', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText(/suggested price \(from the upload sheet\): usd 29\.99/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve quality → send to Pricing' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /publish as free/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/price \(usd\)/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /pricing when published/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^requeue$/i })).not.toBeInTheDocument()
  })

  it('shows the free QA section with one Publish as free button', async () => {
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      price: '0.00',
      status: 'pending_review',
      upload_kind: 'free',
    })

    renderProductDetailPage()

    await screen.findByRole('heading', { name: /import qa/i })
    expect(screen.getByText('Free', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish as free' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send to pricing/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/suggested price/i)).not.toBeInTheDocument()
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

  it('approves a paid model with no price and shows the Pricing message', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'pending_review',
      upload_kind: 'paid',
    })
    vi.mocked(productsApi.approveAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'awaiting_price',
    })

    renderProductDetailPage()

    await user.click(await screen.findByRole('button', { name: 'Approve quality → send to Pricing' }))

    await waitFor(() => {
      expect(productsApi.approveAdminProduct).toHaveBeenCalledWith(productId)
    })
    await waitFor(() => {
      expect(
        useToastStore.getState().toasts.some(
          (item) => item.message === 'Approved. The model now waits on the Pricing page.',
        ),
      ).toBe(true)
    })
  })

  it('publishes a free model with Publish as free', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      price: '0.00',
      status: 'pending_review',
      upload_kind: 'free',
    })
    vi.mocked(productsApi.approveAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'published',
    })

    renderProductDetailPage()

    await user.click(await screen.findByRole('button', { name: 'Publish as free' }))

    await waitFor(() => {
      expect(productsApi.approveAdminProduct).toHaveBeenCalledWith(productId)
    })
  })
})

describe('AdminProductDetailPage waiting for price', () => {
  it('shows a note and Reject, and no approve button', async () => {
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'awaiting_price',
      upload_kind: 'paid',
    })

    renderProductDetailPage()

    expect(
      await screen.findByText('Waiting for price. Set the price on the Pricing page (coming soon).'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve|publish as free/i })).not.toBeInTheDocument()
  })

  it('does not offer awaiting_price or published in the status dropdown, but shows the current one', async () => {
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'draft',
    })
    const first = renderProductDetailPage()
    const select = (await screen.findByLabelText(/^status$/i)) as HTMLSelectElement
    const values = Array.from(select.options).map((option) => option.value)
    expect(values).not.toContain('awaiting_price')
    expect(values).not.toContain('published')
    first.unmount()

    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'awaiting_price',
    })
    renderProductDetailPage()
    const current = (await screen.findByLabelText(/^status$/i)) as HTMLSelectElement
    await waitFor(() => expect(current.value).toBe('awaiting_price'))
    expect(current.selectedOptions[0]).toHaveTextContent('Waiting for price')
  })

  it('does not send the read-only status when saving', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      status: 'awaiting_price',
    })
    vi.mocked(productsApi.updateAdminProduct).mockResolvedValue(sampleProduct)
    renderProductDetailPage()
    await screen.findByDisplayValue('Oak Chair')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(productsApi.updateAdminProduct).toHaveBeenCalled())
    const payload = vi.mocked(productsApi.updateAdminProduct).mock.calls[0][1]
    expect(payload).not.toHaveProperty('status')
  })
})

describe('AdminProductDetailPage sale end', () => {
  const future = () => {
    const date = new Date(Date.now() + 3 * 24 * 3600 * 1000)
    date.setSeconds(0, 0)
    return date
  }

  it('shows the stored UTC time in local time and saves it back as ISO UTC', async () => {
    const user = userEvent.setup()
    const end = future()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      discount_price: '19.99',
      discount_ends_at: end.toISOString(),
      discount_active: true,
    })
    vi.mocked(productsApi.updateAdminProduct).mockResolvedValue(sampleProduct)

    renderProductDetailPage()

    const input = (await screen.findByLabelText(/sale ends \(your local time\)/i)) as HTMLInputElement
    expect(input).toHaveAttribute('type', 'datetime-local')
    // The displayed value, read back as local time, is the same instant.
    expect(new Date(input.value).toISOString()).toBe(end.toISOString())

    // A changed end is sent back as ISO UTC (an unchanged one is not resent).
    const later = new Date(end.getTime() + 24 * 60 * 60 * 1000)
    const pad = (value: number) => String(value).padStart(2, '0')
    const laterLocal = `${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}T${pad(later.getHours())}:${pad(later.getMinutes())}`
    fireEvent.change(input, { target: { value: laterLocal } })
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => {
      expect(productsApi.updateAdminProduct).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({ discount_ends_at: new Date(laterLocal).toISOString() }),
      )
    })
  })

  it('clearing the sale price clears the end date', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      discount_price: '19.99',
      discount_ends_at: future().toISOString(),
      discount_active: true,
    })
    vi.mocked(productsApi.updateAdminProduct).mockResolvedValue(sampleProduct)

    renderProductDetailPage()

    await user.clear(await screen.findByLabelText(/discount price/i))
    expect(screen.queryByLabelText(/sale ends/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => {
      expect(productsApi.updateAdminProduct).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({ discount_price: null, discount_ends_at: null }),
      )
    })
  })

  it('refuses an end date in the past', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      discount_price: '19.99',
      discount_ends_at: null,
      discount_active: true,
    })

    renderProductDetailPage()

    const input = await screen.findByLabelText(/sale ends \(your local time\)/i)
    fireEvent.change(input, { target: { value: '2001-01-01T10:00' } })
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(screen.getByText(SALE_END_PAST_MESSAGE)).toBeInTheDocument()
    expect(productsApi.updateAdminProduct).not.toHaveBeenCalled()
  })

  it('says Sale ended when the sale price is set but no longer active', async () => {
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...sampleProduct,
      discount_price: '19.99',
      discount_ends_at: '2020-01-01T00:00:00Z',
      discount_active: false,
    })

    renderProductDetailPage()

    expect(await screen.findByText('Sale ended')).toBeInTheDocument()
  })
})

describe('AdminProductDetailPage pricing safeguards (security review)', () => {
  const livePaid: AdminProduct = {
    ...sampleProduct,
    status: 'published',
    upload_kind: 'paid',
    price: '40.00',
  }

  it('does not offer Free for a paid upload', async () => {
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue(livePaid)
    renderProductDetailPage()

    expect(await screen.findByText(/paid upload\. to make it free, upload it again/i)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /^pricing$/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^price$/i)).toBeInTheDocument()
  })

  it('loads an ended sale as no sale, so saving clears it instead of restarting it', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...livePaid,
      discount_price: '30.00',
      discount_ends_at: '2020-01-01T00:00:00Z',
      discount_active: false,
    })
    vi.mocked(productsApi.updateAdminProduct).mockResolvedValue(livePaid)
    renderProductDetailPage()

    expect(await screen.findByText('Sale ended')).toBeInTheDocument()
    expect(screen.getByLabelText(/discount price/i)).toHaveValue(null)
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(productsApi.updateAdminProduct).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({ discount_price: null, discount_ends_at: null }),
      )
    })
  })

  it('does not resend an unchanged sale end or an unchanged status', async () => {
    const user = userEvent.setup()
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue({
      ...livePaid,
      discount_price: '30.00',
      discount_ends_at: '2099-01-01T10:30:45Z',
      discount_active: true,
    })
    vi.mocked(productsApi.updateAdminProduct).mockResolvedValue(livePaid)
    renderProductDetailPage()

    await screen.findByDisplayValue('Oak Chair')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(productsApi.updateAdminProduct).toHaveBeenCalled())
    const payload = vi.mocked(productsApi.updateAdminProduct).mock.calls[0][1]
    expect(payload).not.toHaveProperty('discount_ends_at')
    expect(payload).not.toHaveProperty('status')
    expect(payload).toMatchObject({ discount_price: '30.00' })
  })

  it('does not send the form status back after the model moved on (for example after QA approve)', async () => {
    const user = userEvent.setup()
    const pending: AdminProduct = { ...sampleProduct, status: 'pending_review', upload_kind: 'paid' }
    vi.mocked(productsApi.getAdminProduct).mockResolvedValue(pending)
    vi.mocked(productsApi.updateAdminProduct).mockResolvedValue(pending)
    renderProductDetailPage()

    await screen.findByDisplayValue('Oak Chair')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(productsApi.updateAdminProduct).toHaveBeenCalled())
    expect(vi.mocked(productsApi.updateAdminProduct).mock.calls[0][1]).not.toHaveProperty('status')
  })
})
