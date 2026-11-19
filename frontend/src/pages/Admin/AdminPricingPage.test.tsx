import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as categoriesApi from '../../api/categoriesApi'
import * as pricingApi from '../../api/pricingApi'
import { createTestQueryClient, resetToastStore } from '../../test/test-utils'
import type { PricingPackage, PricingRow } from '../../types/pricing'
import { AdminPricingPage } from './AdminPricingPage'

vi.mock('../../api/pricingApi', () => ({
  listPricingModels: vi.fn(),
  listPricingBatches: vi.fn(),
  publishPricing: vi.fn(),
}))
vi.mock('../../api/categoriesApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/categoriesApi')>('../../api/categoriesApi')
  return { ...actual, listAdminCategories: vi.fn() }
})

function whole(price: string | null, sale: string | null = null): PricingPackage {
  return {
    kind: 'whole', label: 'Whole File', price, sale_price: sale, sale_ends_at: null,
    buyer_pays: sale ?? price,
  }
}

function row(id: string, name: string, overrides: Partial<PricingRow> = {}): PricingRow {
  return {
    id,
    name,
    sku: `MDL-${id}`,
    slug: name.toLowerCase(),
    thumbnail: '',
    status: 'awaiting_price',
    pending_update: false,
    category: { id: 'cat-1', name: 'Chairs', parent_id: null },
    polygon_count: 5000,
    poly_tier: 'low',
    price: '20.00',
    currency: 'USD',
    discount_price: null,
    discount_ends_at: null,
    discount_active: false,
    buyer_pays: '20.00',
    packages: [whole('20.00')],
    bundle_warning: '',
    import_batch_id: 'batch-1',
    created_at: '2026-11-10T00:00:00Z',
    ...overrides,
  }
}

const rows = [
  row('1', 'Oak Chair'),
  row('2', 'Pine Stool', { price: '0.00', buyer_pays: '0.00', packages: [whole(null)] }),
]

function renderPage(path = '/console/pricing') {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/console/pricing" element={<AdminPricingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetToastStore()
  vi.mocked(pricingApi.listPricingModels).mockImplementation(async (params) => ({
    count: params.page_size === 1 ? 7 : rows.length,
    next: null,
    previous: null,
    results: params.tab === 'waiting' ? rows : [row('9', 'Live Lamp', { status: 'published' })],
  }))
  vi.mocked(pricingApi.listPricingBatches).mockResolvedValue(['batch-1'])
  vi.mocked(categoriesApi.listAdminCategories).mockResolvedValue({
    count: 0, next: null, previous: null, results: [],
  })
})

describe('AdminPricingPage', () => {
  it('lists the models waiting for a price, with tab counts', async () => {
    renderPage()

    expect(await screen.findByText('Oak Chair')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /waiting for price/i })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('tab', { name: /live models/i })).getByText('7')).toBeInTheDocument()
    // Each model lists its packages; Pine Stool's Whole File has no price yet.
    const pine = screen.getByText('Pine Stool').closest('tr')!
    expect(pine).toHaveTextContent('Whole File: Not set')
    expect(screen.getByText('Oak Chair').closest('tr')).toHaveTextContent('Whole File: $20.00')
    expect(screen.getByRole('button', { name: /publish selected \(0\)/i })).toBeDisabled()
  })

  it('has no calculator and no pricing set-up for now', async () => {
    renderPage()

    expect(await screen.findByText('Oak Chair')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Calculator' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /calculate preview/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByText(/default package percentages/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/hours for/i)).not.toBeInTheDocument()
  })

  it('shows the bundle warning on a model', async () => {
    vi.mocked(pricingApi.listPricingModels).mockResolvedValue({
      count: 1, next: null, previous: null,
      results: [row('1', 'Oak Chair', {
        packages: [
          { ...whole('10.00'), kind: 'with_light_rig', label: 'With Light Rig' },
          whole('12.00'),
        ],
        bundle_warning: 'Whole File (12.00) is not cheaper than the other packages together (10.00).',
      })],
    })
    renderPage()

    expect(await screen.findByRole('note')).toHaveTextContent('Whole File (12.00) is not cheaper')
  })

  it('publishes after a summary and lists the models that stayed waiting', async () => {
    const user = userEvent.setup()
    vi.mocked(pricingApi.publishPricing).mockResolvedValue({
      models: 2, published: 1, failed: 1,
      results: [
        { id: '1', name: 'Oak Chair', sku: 'MDL-1', published: true, reason: '' },
        { id: '2', name: 'Pine Stool', sku: 'MDL-2', published: false, reason: 'Set a price of at least 0.50 USD first.' },
      ],
    })
    renderPage()

    await user.click(await screen.findByLabelText('Select all models on this page'))
    await user.click(screen.getByRole('button', { name: /publish selected \(2\)/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/1 have a package with no price yet/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /publish 2 models/i }))

    await waitFor(() => expect(pricingApi.publishPricing).toHaveBeenCalledWith(['1', '2'], 2))
    expect(await screen.findByText('1 published, 1 not published')).toBeInTheDocument()
    expect(screen.getByText(/Set a price of at least 0.50 USD first/)).toBeInTheDocument()
  })

  it('has no publish button on the live tab', async () => {
    renderPage('/console/pricing?tab=live')

    expect(await screen.findByText('Live Lamp')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /publish selected/i })).not.toBeInTheDocument()
  })
})
