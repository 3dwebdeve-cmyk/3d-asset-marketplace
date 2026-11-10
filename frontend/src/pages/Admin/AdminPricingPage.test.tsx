import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as categoriesApi from '../../api/categoriesApi'
import * as pricingApi from '../../api/pricingApi'
import { createTestQueryClient, resetToastStore } from '../../test/test-utils'
import type { PricingPreview, PricingRow } from '../../types/pricing'
import { AdminPricingPage } from './AdminPricingPage'

vi.mock('../../api/pricingApi', () => ({
  listPricingModels: vi.fn(),
  listPricingBatches: vi.fn(),
  previewPricing: vi.fn(),
  applyPricing: vi.fn(),
  publishPricing: vi.fn(),
}))
vi.mock('../../api/categoriesApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/categoriesApi')>('../../api/categoriesApi')
  return { ...actual, listAdminCategories: vi.fn() }
})

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
    import_batch_id: 'batch-1',
    created_at: '2026-11-10T00:00:00Z',
    ...overrides,
  }
}

const rows = [row('1', 'Oak Chair'), row('2', 'Pine Stool', { price: '0.00', buyer_pays: '0.00' })]

function previewOf(overrides: Partial<PricingPreview['summary']> = {}, error = ''): PricingPreview {
  return {
    rows: [
      {
        id: '1', name: 'Oak Chair', sku: 'MDL-1', status: 'awaiting_price', polygon_count: 5000,
        poly_tier: 'low', currency: 'USD', old_price: '20.00', old_sale_price: null,
        old_sale_ends_at: null, new_price: '12.00', new_sale_price: null, new_sale_ends_at: null,
        amount_off: '0.00', percent_off: '0.0', buyer_pays: '12.00', changed: !error, error,
      },
    ],
    summary: {
      models: 1, changed: error ? 0 : 1, errors: error ? 1 : 0, currency: 'USD',
      buyer_pays_before: '20.00', buyer_pays_after: '12.00', needs_confirmation: false,
      ...overrides,
    },
    preview_token: 'a'.repeat(64),
  }
}

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

async function selectFirstModel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByLabelText('Select Oak Chair'))
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
    expect(screen.getByText('Not set')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /publish selected \(0\)/i })).toBeDisabled()
  })

  it('previews one price and saves it with the preview token', async () => {
    const user = userEvent.setup()
    vi.mocked(pricingApi.previewPricing).mockResolvedValue(previewOf())
    vi.mocked(pricingApi.applyPricing).mockResolvedValue({ batch_id: 'pricing-x', models: 1, changed: 1, unchanged: 0 })
    renderPage()

    await selectFirstModel(user)
    await user.type(screen.getByLabelText('Price (USD)'), '12')
    await user.click(screen.getByRole('button', { name: /calculate preview \(1\)/i }))

    expect(await screen.findByText(/1 will change/i)).toBeInTheDocument()
    expect(pricingApi.previewPricing).toHaveBeenCalledWith(
      expect.objectContaining({ product_ids: ['1'], rule: 'set_price', price: '12', low_below: 10000, high_above: 100000 }),
    )
    await user.click(screen.getByRole('button', { name: /save prices/i }))

    await waitFor(() =>
      expect(pricingApi.applyPricing).toHaveBeenCalledWith(
        expect.objectContaining({ product_ids: ['1'], rule: 'set_price', price: '12', preview_token: 'a'.repeat(64) }),
      ),
    )
  })

  it('checks the rule before asking the server', async () => {
    const user = userEvent.setup()
    renderPage()

    await selectFirstModel(user)
    await user.click(screen.getByLabelText('Give a sale'))
    await user.type(screen.getByLabelText(/percent off/i), '95')
    await user.click(screen.getByRole('button', { name: /calculate preview/i }))

    expect(await screen.findByText(/between 0.01 and 90/i)).toBeInTheDocument()
    expect(pricingApi.previewPricing).not.toHaveBeenCalled()
  })

  it('sends a sale with its end in UTC and the .99 choice', async () => {
    const user = userEvent.setup()
    vi.mocked(pricingApi.previewPricing).mockResolvedValue(previewOf())
    renderPage()

    await selectFirstModel(user)
    await user.click(screen.getByLabelText('Give a sale'))
    await user.type(screen.getByLabelText(/percent off/i), '20')
    await user.click(screen.getByLabelText(/end sale prices in \.99/i))
    const end = screen.getByLabelText(/sale ends/i)
    await user.type(end, '2099-01-31T18:30')
    await user.click(screen.getByRole('button', { name: /calculate preview/i }))

    await waitFor(() =>
      expect(pricingApi.previewPricing).toHaveBeenCalledWith(
        expect.objectContaining({
          rule: 'percent_off',
          percent: '20',
          round_99: true,
          discount_ends_at: new Date('2099-01-31T18:30').toISOString(),
        }),
      ),
    )
  })

  it('needs the typed model count for a sale above 50% off', async () => {
    const user = userEvent.setup()
    vi.mocked(pricingApi.previewPricing).mockResolvedValue(previewOf({ needs_confirmation: true }))
    vi.mocked(pricingApi.applyPricing).mockResolvedValue({ batch_id: 'b', models: 1, changed: 1, unchanged: 0 })
    renderPage()

    await selectFirstModel(user)
    await user.type(screen.getByLabelText('Price (USD)'), '12')
    await user.click(screen.getByRole('button', { name: /calculate preview/i }))
    const save = await screen.findByRole('button', { name: /save prices/i })
    expect(save).toBeDisabled()

    await user.type(screen.getByLabelText(/type 1 to confirm/i), '1')
    expect(save).toBeEnabled()
    await user.click(save)
    await waitFor(() =>
      expect(pricingApi.applyPricing).toHaveBeenCalledWith(expect.objectContaining({ confirm_count: 1 })),
    )
  })

  it('does not save while a row has an error', async () => {
    const user = userEvent.setup()
    vi.mocked(pricingApi.previewPricing).mockResolvedValue(previewOf({}, 'The price must be at least 0.50 USD.'))
    renderPage()

    await selectFirstModel(user)
    await user.type(screen.getByLabelText('Price (USD)'), '12')
    await user.click(screen.getByRole('button', { name: /calculate preview/i }))

    expect(await screen.findByText('The price must be at least 0.50 USD.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save prices/i })).toBeDisabled()
  })

  it('asks for a new preview when prices changed since the preview (409)', async () => {
    const user = userEvent.setup()
    vi.mocked(pricingApi.previewPricing).mockResolvedValue(previewOf())
    vi.mocked(pricingApi.applyPricing).mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409, statusText: 'Conflict', headers: {}, config: { headers: new AxiosHeaders() }, data: {},
      }),
    )
    renderPage()

    await selectFirstModel(user)
    await user.type(screen.getByLabelText('Price (USD)'), '12')
    await user.click(screen.getByRole('button', { name: /calculate preview/i }))
    await user.click(await screen.findByRole('button', { name: /save prices/i }))

    expect(await screen.findByText(/calculate the preview again/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save prices/i })).not.toBeInTheDocument()
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
    expect(within(dialog).getByText(/1 have no price yet/i)).toBeInTheDocument()
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
