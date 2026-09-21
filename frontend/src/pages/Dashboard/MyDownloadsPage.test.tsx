import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as downloadsApi from '../../api/downloadsApi'
import * as ordersApi from '../../api/ordersApi'
import { createTestQueryClient, resetAuthStore, testUser } from '../../test/test-utils'
import { useAuthStore } from '../../store/authStore'
import type { DownloadEntitlement } from '../../types/download'
import type { CustomerOrderListItem } from '../../types/order'
import { MyDownloadsPage } from './MyDownloadsPage'

vi.mock('../../api/downloadsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/downloadsApi')>(
    '../../api/downloadsApi',
  )
  return {
    ...actual,
    listDownloadEntitlements: vi.fn(),
    listDownloadHistory: vi.fn(),
    downloadCatalogFile: vi.fn(),
  }
})

vi.mock('../../api/ordersApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/ordersApi')>(
    '../../api/ordersApi',
  )
  return {
    ...actual,
    listCustomerOrders: vi.fn(),
  }
})

const entitlement: DownloadEntitlement = {
  product_type: 'product',
  product_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  title: 'Hero Sword',
  slug: 'hero-sword',
  files: [
    {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      file_name: 'hero-sword.zip',
      file_format: 'zip',
      file_size: 2048,
      version: '1.0',
      download_url: '/api/v1/downloads/products/cccccccc-cccc-cccc-cccc-cccccccccccc/files/dddddddd-dddd-dddd-dddd-dddddddddddd/download/',
      last_downloaded_at: null,
    },
  ],
}

const catalogInvoice: CustomerOrderListItem = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  invoice_number: 'INV-20260917-18B55F38',
  total_amount: '29.99',
  currency: 'USD',
  order_status: 'paid',
  payment_status: 'paid',
  item_count: 1,
  created_at: '2026-09-17T00:00:00Z',
  updated_at: '2026-09-17T00:00:00Z',
}

function renderMyDownloadsPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MyDownloadsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  vi.clearAllMocks()
  useAuthStore.setState({
    accessToken: 'access-token',
    user: testUser,
    isAuthenticated: true,
  })
  vi.mocked(downloadsApi.listDownloadEntitlements).mockResolvedValue([entitlement])
  vi.mocked(downloadsApi.listDownloadHistory).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  vi.mocked(ordersApi.listCustomerOrders).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [catalogInvoice],
  })
})

describe('MyDownloadsPage', () => {
  it('renders library rows and downloads on click', async () => {
    const user = userEvent.setup()
    renderMyDownloadsPage()

    expect(await screen.findByRole('heading', { name: /my downloads/i })).toBeInTheDocument()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Hero Sword')).toBeInTheDocument()
    expect(within(table).getByText('hero-sword.zip')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^download$/i }))
    expect(downloadsApi.downloadCatalogFile).toHaveBeenCalledWith(
      'product',
      entitlement.product_id,
      entitlement.files[0].id,
      'hero-sword.zip',
    )
  })

  it('shows empty library state', async () => {
    vi.mocked(downloadsApi.listDownloadEntitlements).mockResolvedValue([])
    renderMyDownloadsPage()

    expect(
      await screen.findByText(/do not have any downloadable purchases yet/i),
    ).toBeInTheDocument()
  })

  it('shows download history tab', async () => {
    const user = userEvent.setup()
    renderMyDownloadsPage()

    await screen.findByRole('heading', { name: /my downloads/i })
    await user.click(screen.getByRole('tab', { name: /download history/i }))
    expect(await screen.findByText(/no downloads recorded yet/i)).toBeInTheDocument()
  })

  it('shows catalog invoices on the invoices tab', async () => {
    const user = userEvent.setup()
    renderMyDownloadsPage()

    await screen.findByRole('heading', { name: /my downloads/i })
    await user.click(screen.getByRole('tab', { name: /^invoices$/i }))

    expect(
      await screen.findByRole('link', { name: catalogInvoice.invoice_number }),
    ).toHaveAttribute('href', `/dashboard/orders/${catalogInvoice.id}`)
    expect(ordersApi.listCustomerOrders).toHaveBeenCalledWith(
      expect.objectContaining({ item_type: 'catalog' }),
    )
  })
})
