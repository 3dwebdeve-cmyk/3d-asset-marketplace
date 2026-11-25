import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as categoriesApi from '../../api/categoriesApi'
import * as pricingApi from '../../api/pricingApi'
import { createTestQueryClient, resetToastStore } from '../../test/test-utils'
import type { PricingCalculation, PricingPackage, PricingRow } from '../../types/pricing'
import { AdminPricingPage } from './AdminPricingPage'

vi.mock('../../api/pricingApi', () => ({
  listPricingModels: vi.fn(),
  listPricingBatches: vi.fn(),
  calculatePricing: vi.fn(),
  publishPricing: vi.fn(),
  savePricingHours: vi.fn(),
}))
vi.mock('../../api/categoriesApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/categoriesApi')>('../../api/categoriesApi')
  return { ...actual, listAdminCategories: vi.fn() }
})

function pkg(kind: PricingPackage['kind'], label: string, price: string | null = null): PricingPackage {
  return { kind, label, price, sale_price: null, sale_ends_at: null, buyer_pays: price }
}

const environment = (price: string | null = null) => pkg('environment', 'With Environment', price)
const glb = (price: string | null = null) => pkg('glb_only', 'GLB Only', price)

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
    hours_spent: '10.00',
    price: '0.00',
    currency: 'USD',
    discount_price: null,
    discount_ends_at: null,
    discount_active: false,
    buyer_pays: '0.00',
    packages: [glb(), environment()],
    single_zip: false,
    import_batch_id: 'batch-1',
    created_at: '2026-11-10T00:00:00Z',
    ...overrides,
  }
}

const rows = [
  row('1', 'Oak Chair'),
  row('2', 'Pine Stool', { hours_spent: null, packages: [environment()] }),
  row('3', 'Elm Desk', { packages: [pkg('with_light_rig', 'With Light Rig'), environment()] }),
]

const TOKEN = 'a'.repeat(64)

function calculationOf(overrides: Partial<PricingCalculation> = {}): PricingCalculation {
  return {
    rows: [
      {
        id: '1', name: 'Oak Chair', sku: 'MDL-1', hours_spent: '10.00', error: '',
        packages: [
          { kind: 'glb_only', label: 'GLB Only', old_price: null, price: '50.00' },
          { kind: 'environment', label: 'With Environment', old_price: null, price: '200.00' },
        ],
      },
      {
        id: '2', name: 'Pine Stool', sku: 'MDL-2', hours_spent: null,
        error: 'Enter the hours spent first.', packages: [],
      },
    ],
    summary: { models: 2, priced: 1, errors: 1, currency: 'USD' },
    preview_token: TOKEN,
    ...overrides,
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

async function tick(user: ReturnType<typeof userEvent.setup>, ...names: string[]) {
  for (const name of names) await user.click(await screen.findByLabelText(`Select ${name}`))
}

/** Type the rate and the five percents into the Model Pricing box. */
async function fillBox(user: ReturnType<typeof userEvent.setup>, rate = '20') {
  await user.type(screen.getByLabelText('Rate per hour (USD)'), rate)
  const percents = {
    'With Light Rig': '60',
    'Without Light Rig': '50',
    'GLB Only': '25',
    'With Environment': '30',
  }
  for (const [label, value] of Object.entries(percents)) {
    await user.type(screen.getByLabelText(`${label} percent`), value)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetToastStore()
  vi.mocked(pricingApi.listPricingModels).mockImplementation(async (params) => ({
    count: params.page_size === 1 ? 7 : rows.length,
    next: null,
    previous: null,
    results: params.tab === 'waiting' ? rows : [row('9', 'Live Lamp', { status: 'published', packages: [environment('20.00')], price: '20.00', buyer_pays: '20.00' })],
  }))
  vi.mocked(pricingApi.listPricingBatches).mockResolvedValue(['batch-1'])
  vi.mocked(categoriesApi.listAdminCategories).mockResolvedValue({
    count: 0, next: null, previous: null, results: [],
  })
})

describe('AdminPricingPage', () => {
  it('lists the waiting models with their hours and variations, and the tab counts', async () => {
    renderPage()

    expect(await screen.findByText('Oak Chair')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /waiting for price/i })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('tab', { name: /live models/i })).getByText('7')).toBeInTheDocument()
    expect(screen.getByLabelText('Hours for Oak Chair')).toHaveValue('10.00')
    expect(screen.getByLabelText('Hours for Pine Stool')).toHaveValue('')
    // Each model lists only the variations it has.
    expect(screen.getByText('Oak Chair').closest('tr')).toHaveTextContent('GLB Only: Not set')
    expect(screen.getByText('Pine Stool').closest('tr')).not.toHaveTextContent('GLB Only')
    expect(screen.getByText('Elm Desk').closest('tr')).toHaveTextContent('With Light Rig: Not set')
    expect(screen.getByRole('button', { name: /publish selected \(0\)/i })).toBeDisabled()
  })

  it('shows the Model Pricing box with a rate and a percent for every variation', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Model Pricing' })).toBeInTheDocument()
    expect(screen.getByLabelText('Rate per hour (USD)')).toBeInTheDocument()
    for (const label of ['With Light Rig', 'Without Light Rig', 'With Environment', 'GLB Only']) {
      expect(screen.getByLabelText(`${label} percent`)).toBeInTheDocument()
    }
  })

  it('checks the boxes before asking the server', async () => {
    const user = userEvent.setup()
    renderPage()

    await tick(user, 'Oak Chair')
    await user.click(screen.getByRole('button', { name: /calculate prices/i }))
    expect(await screen.findByText(/enter the rate per hour/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Rate per hour (USD)'), '20')
    await user.click(screen.getByRole('button', { name: /calculate prices/i }))
    expect(await screen.findByText(/enter the with light rig percent/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText('With Light Rig percent'), '250')
    await user.click(screen.getByRole('button', { name: /calculate prices/i }))
    expect(await screen.findByText(/enter the with light rig percent/i)).toBeInTheDocument()
    expect(pricingApi.calculatePricing).not.toHaveBeenCalled()
  })

  it('needs a ticked model to calculate', async () => {
    renderPage()
    await screen.findByText('Oak Chair')
    expect(screen.getByRole('button', { name: /calculate prices \(0\)/i })).toBeDisabled()
  })

  it('sends the rate and the percents, then shows each variation\'s new price beside it', async () => {
    const user = userEvent.setup()
    vi.mocked(pricingApi.calculatePricing).mockResolvedValue(calculationOf())
    renderPage()

    await tick(user, 'Oak Chair', 'Pine Stool')
    await fillBox(user)
    await user.click(screen.getByRole('button', { name: /calculate prices \(2\)/i }))

    await waitFor(() =>
      expect(pricingApi.calculatePricing).toHaveBeenCalledWith({
        product_ids: ['1', '2'],
        rate: '20',
        percents: {
          with_light_rig: '60', without_light_rig: '50', glb_only: '25', environment: '30',
        },
      }),
    )
    const oak = (await screen.findByText('Oak Chair')).closest('tr')!
    expect(oak).toHaveTextContent('GLB Only: Not set → $50.00')
    expect(oak).toHaveTextContent('With Environment: Not set → $200.00')
    // A model that cannot be priced says why, next to the model.
    const pine = screen.getByText('Pine Stool').closest('tr')!
    expect(within(pine).getByRole('alert')).toHaveTextContent('Enter the hours spent first.')
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 models priced, 1 cannot be priced')
  })

  it('clears the calculation when the selection or a box changes', async () => {
    const user = userEvent.setup()
    vi.mocked(pricingApi.calculatePricing).mockResolvedValue(calculationOf())
    renderPage()

    await tick(user, 'Oak Chair')
    await fillBox(user)
    await user.click(screen.getByRole('button', { name: /calculate prices/i }))
    expect(await screen.findByText(/→ \$50.00/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('GLB Only percent'), '5')
    expect(screen.queryByText(/→ \$50.00/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /publish selected/i })).toBeDisabled()
  })

  it('saves the hours typed in the table when the box loses focus', async () => {
    const user = userEvent.setup()
    vi.mocked(pricingApi.savePricingHours).mockResolvedValue({ models: 1, changed: 1 })
    renderPage()

    const hours = await screen.findByLabelText('Hours for Pine Stool')
    await user.type(hours, '7.5')
    await user.tab()

    await waitFor(() =>
      expect(pricingApi.savePricingHours).toHaveBeenCalledWith([{ id: '2', hours_spent: '7.5' }]),
    )
  })

  it('refuses hours that are not a number above 0', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByLabelText('Hours for Pine Stool'), '0')
    await user.tab()

    expect(await screen.findByText(/hours must be a number above 0/i)).toBeInTheDocument()
    expect(pricingApi.savePricingHours).not.toHaveBeenCalled()
  })

  it('publishes after a summary with the calculation\'s token and lists what stayed waiting', async () => {
    const user = userEvent.setup()
    vi.mocked(pricingApi.calculatePricing).mockResolvedValue(calculationOf())
    vi.mocked(pricingApi.publishPricing).mockResolvedValue({
      batch_id: 'pricing-x', models: 2, published: 1, failed: 1,
      results: [
        { id: '1', name: 'Oak Chair', sku: 'MDL-1', published: true, reason: '' },
        { id: '2', name: 'Pine Stool', sku: 'MDL-2', published: false, reason: 'Enter the hours spent first.' },
      ],
    })
    renderPage()

    await tick(user, 'Oak Chair', 'Pine Stool')
    await fillBox(user)
    await user.click(screen.getByRole('button', { name: /calculate prices/i }))
    await user.click(await screen.findByRole('button', { name: /publish selected \(2\)/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('1 cannot be priced and will stay waiting')
    await user.click(within(dialog).getByRole('button', { name: /publish 2 models/i }))

    await waitFor(() =>
      expect(pricingApi.publishPricing).toHaveBeenCalledWith(
        expect.objectContaining({
          product_ids: ['1', '2'], rate: '20', preview_token: TOKEN, confirm_count: 2,
        }),
      ),
    )
    expect(await screen.findByText('1 published, 1 not published')).toBeInTheDocument()
    expect(screen.getByText(/Enter the hours spent first/, { selector: 'li' })).toBeInTheDocument()
  })

  it('asks for a new calculation when the prices or hours changed (409)', async () => {
    const user = userEvent.setup()
    vi.mocked(pricingApi.calculatePricing).mockResolvedValue(calculationOf())
    vi.mocked(pricingApi.publishPricing).mockRejectedValue(
      new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409, statusText: 'Conflict', headers: {}, config: { headers: new AxiosHeaders() }, data: {},
      }),
    )
    renderPage()

    await tick(user, 'Oak Chair')
    await fillBox(user)
    await user.click(screen.getByRole('button', { name: /calculate prices/i }))
    await user.click(await screen.findByRole('button', { name: /publish selected/i }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /publish 1 model/i }))

    expect(await screen.findByText(/calculate again/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /publish selected/i })).toBeDisabled()
  })

  it('has no pricing box and no publish on the live tab, and shows the live hours', async () => {
    renderPage('/console/pricing?tab=live')

    expect(await screen.findByText('Live Lamp')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Model Pricing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /publish selected/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/hours for/i)).not.toBeInTheDocument()
  })

  // ─── The Single zip section ───────────────────────────────────────────────

  function useSingleZipModels() {
    const lone = row('20', 'Lone Lamp', { single_zip: true, hours_spent: '5.00', packages: [pkg('whole', 'Whole File')] })
    vi.mocked(pricingApi.listPricingModels).mockImplementation(async (params) => ({
      count: params.page_size === 1 ? 1 : 1,
      next: null,
      previous: null,
      results: params.kind === 'single_zip' ? [lone] : rows,
    }))
    return lone
  }

  it('asks for the Variations section by default and has a Single zip section', async () => {
    renderPage()

    expect(await screen.findByText('Oak Chair')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^variations/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^single zip/i })).toHaveAttribute('aria-pressed', 'false')
    expect(pricingApi.listPricingModels).toHaveBeenCalledWith(expect.objectContaining({ tab: 'waiting', kind: 'variations' }))
  })

  it('lists only the single-zip models in the Single zip section', async () => {
    const user = userEvent.setup()
    useSingleZipModels()
    renderPage()
    await screen.findByText('Oak Chair')

    await user.click(screen.getByRole('button', { name: /^single zip/i }))

    expect(await screen.findByText('Lone Lamp')).toBeInTheDocument()
    expect(screen.queryByText('Oak Chair')).not.toBeInTheDocument()
    expect(pricingApi.listPricingModels).toHaveBeenCalledWith(expect.objectContaining({ kind: 'single_zip' }))
    expect(screen.getByRole('button', { name: /^single zip/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows only "Base price = Hours x a box" for a single zip, with no percents', async () => {
    const user = userEvent.setup()
    useSingleZipModels()
    renderPage()
    await screen.findByText('Oak Chair')

    await user.click(screen.getByRole('button', { name: /^single zip/i }))
    await screen.findByText('Lone Lamp')

    expect(screen.getByRole('heading', { name: 'Model Pricing' })).toBeInTheDocument()
    expect(screen.getByLabelText('Rate per hour (USD)')).toBeInTheDocument()
    expect(screen.getByText('Base price = Hours ×')).toBeInTheDocument()
    for (const label of ['With Light Rig', 'Without Light Rig', 'With Environment', 'GLB Only', 'Whole File']) {
      expect(screen.queryByLabelText(`${label} percent`)).not.toBeInTheDocument()
    }
  })

  it('sends only the multiplier and the section for a single zip, then shows the new price', async () => {
    const user = userEvent.setup()
    const lone = useSingleZipModels()
    vi.mocked(pricingApi.calculatePricing).mockResolvedValue(calculationOf({
      rows: [{
        id: lone.id, name: 'Lone Lamp', sku: 'MDL-20', hours_spent: '5.00', error: '',
        packages: [{ kind: 'whole', label: 'Whole File', old_price: null, price: '63.00' }],
      }],
      summary: { models: 1, priced: 1, errors: 0, currency: 'USD' },
    }))
    renderPage()
    await screen.findByText('Oak Chair')
    await user.click(screen.getByRole('button', { name: /^single zip/i }))
    await screen.findByText('Lone Lamp')

    await tick(user, 'Lone Lamp')
    await user.type(screen.getByLabelText('Rate per hour (USD)'), '12.5')
    await user.click(screen.getByRole('button', { name: /calculate prices \(1\)/i }))

    await waitFor(() =>
      expect(pricingApi.calculatePricing).toHaveBeenCalledWith({ product_ids: ['20'], rate: '12.5', kind: 'single_zip' }),
    )
    const lamp = (await screen.findByText('Lone Lamp')).closest('tr')!
    await waitFor(() => expect(lamp).toHaveTextContent('Whole File: Not set → $63.00'))
  })

  it('needs the multiplier before calculating a single zip', async () => {
    const user = userEvent.setup()
    useSingleZipModels()
    renderPage()
    await screen.findByText('Oak Chair')
    await user.click(screen.getByRole('button', { name: /^single zip/i }))
    await screen.findByText('Lone Lamp')

    await tick(user, 'Lone Lamp')
    await user.click(screen.getByRole('button', { name: /calculate prices \(1\)/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/number to multiply the hours by/i)
    expect(pricingApi.calculatePricing).not.toHaveBeenCalled()
  })
})
