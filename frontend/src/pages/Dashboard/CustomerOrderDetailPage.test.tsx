import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as downloadsApi from '../../api/downloadsApi'
import * as ordersApi from '../../api/ordersApi'
import { createTestQueryClient, resetAuthStore, testUser } from '../../test/test-utils'
import { useAuthStore } from '../../store/authStore'
import type { CustomerOrder } from '../../types/order'
import { CustomerOrderDetailPage } from './CustomerOrderDetailPage'

vi.mock('../../api/ordersApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/ordersApi')>(
    '../../api/ordersApi',
  )
  return {
    ...actual,
    getCustomerOrder: vi.fn(),
    downloadCustomerOrderInvoice: vi.fn(),
  }
})

vi.mock('../../api/downloadsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/downloadsApi')>(
    '../../api/downloadsApi',
  )
  return {
    ...actual,
    downloadCatalogFileByUrl: vi.fn(),
  }
})

const orderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const pendingOrder: CustomerOrder = {
  id: orderId,
  invoice_number: 'INV-20260729-ABCD',
  total_amount: '59.98',
  currency: 'USD',
  order_status: 'pending',
  payment_status: 'pending',
  item_count: 1,
  items_total: '39.99',
  items: [
    {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      product_type: 'product',
      product_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      title: 'Hero Sword',
      slug: 'hero-sword',
      quantity: 1,
      purchase_price: '39.99',
      line_total: '39.99',
      can_download: false,
      files: [],
      created_at: '2026-07-29T00:00:00Z',
      updated_at: '2026-07-29T00:00:00Z',
    },
  ],
  created_at: '2026-07-29T00:00:00Z',
  updated_at: '2026-07-29T00:00:00Z',
}

const paidOrder: CustomerOrder = {
  ...pendingOrder,
  order_status: 'paid',
  payment_status: 'paid',
  items: [
    {
      ...pendingOrder.items[0],
      can_download: true,
      files: [
        {
          id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          file_name: 'hero-sword.zip',
          file_format: 'zip',
          file_size: 2048,
          version: '1.0',
          download_url:
            '/api/v1/downloads/products/cccccccc-cccc-cccc-cccc-cccccccccccc/files/dddddddd-dddd-dddd-dddd-dddddddddddd/download/',
        },
      ],
    },
  ],
}

function renderCustomerOrderDetailPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/dashboard/orders/${orderId}`]}>
        <Routes>
          <Route path="/dashboard/orders/:orderId" element={<CustomerOrderDetailPage />} />
        </Routes>
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
  vi.mocked(ordersApi.getCustomerOrder).mockResolvedValue(pendingOrder)
})

describe('CustomerOrderDetailPage', () => {
  it('renders line items with title, quantity, and price', async () => {
    renderCustomerOrderDetailPage()

    expect(await screen.findByRole('heading', { name: pendingOrder.invoice_number })).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Hero Sword')).toBeInTheDocument()
    expect(within(table).getAllByText('USD 39.99')).toHaveLength(2)
    expect(within(table).getByText('1')).toBeInTheDocument()
  })

  it('shows disabled download controls when order is not fully paid', async () => {
    renderCustomerOrderDetailPage()

    await screen.findByRole('heading', { name: pendingOrder.invoice_number })
    const downloadButton = screen.getByRole('button', { name: /^download$/i })
    expect(downloadButton).toBeDisabled()
    expect(downloadButton).toHaveAttribute(
      'title',
      'Downloads unlock when order and payment are both paid',
    )
    expect(
      screen.getByText(/downloads unlock when both order and payment status are paid/i),
    ).toBeInTheDocument()
  })

  it('enables download when order is fully paid', async () => {
    const user = userEvent.setup()
    vi.mocked(ordersApi.getCustomerOrder).mockResolvedValue(paidOrder)
    renderCustomerOrderDetailPage()

    await screen.findByRole('heading', { name: paidOrder.invoice_number })
    const downloadButton = screen.getByRole('button', { name: /^download$/i })
    expect(downloadButton).toBeEnabled()
    await user.click(downloadButton)
    expect(downloadsApi.downloadCatalogFileByUrl).toHaveBeenCalledWith(
      paidOrder.items[0].files[0].download_url,
      'hero-sword.zip',
    )
  })

  it('shows a placeholder when a paid item has no downloadable files', async () => {
    vi.mocked(ordersApi.getCustomerOrder).mockResolvedValue({
      ...paidOrder,
      items: [{ ...paidOrder.items[0], files: [] }],
    })
    renderCustomerOrderDetailPage()

    await screen.findByRole('heading', { name: paidOrder.invoice_number })
    expect(screen.getByText('No files')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^download$/i })).not.toBeInTheDocument()
  })

  it('shows an error when the file download fails', async () => {
    const user = userEvent.setup()
    vi.mocked(ordersApi.getCustomerOrder).mockResolvedValue(paidOrder)
    vi.mocked(downloadsApi.downloadCatalogFileByUrl).mockRejectedValue(new Error('boom'))
    renderCustomerOrderDetailPage()

    await screen.findByRole('heading', { name: paidOrder.invoice_number })
    await user.click(screen.getByRole('button', { name: /^download$/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('hides download invoice when order is not paid', async () => {
    renderCustomerOrderDetailPage()

    await screen.findByRole('heading', { name: pendingOrder.invoice_number })
    expect(screen.queryByRole('button', { name: /download invoice/i })).not.toBeInTheDocument()
  })

  it('shows download invoice when order is paid and downloads on click', async () => {
    const user = userEvent.setup()
    vi.mocked(ordersApi.getCustomerOrder).mockResolvedValue(paidOrder)
    vi.mocked(ordersApi.downloadCustomerOrderInvoice).mockResolvedValue(undefined)
    renderCustomerOrderDetailPage()

    await screen.findByRole('heading', { name: paidOrder.invoice_number })
    const invoiceButton = screen.getByRole('button', { name: /download invoice/i })
    expect(invoiceButton).toBeEnabled()
    await user.click(invoiceButton)
    expect(ordersApi.downloadCustomerOrderInvoice).toHaveBeenCalledWith(
      paidOrder.id,
      paidOrder.invoice_number,
    )
  })

  it('shows the 404 page when the order does not exist', async () => {
    const error = new AxiosError('Not found')
    error.response = {
      status: 404,
      statusText: 'Not Found',
      headers: {},
      config: { headers: {} } as never,
      data: { detail: 'Not found.' },
    }
    vi.mocked(ordersApi.getCustomerOrder).mockRejectedValue(error)
    renderCustomerOrderDetailPage()

    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /homepage/i })).toHaveAttribute('href', '/home')
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('shows error state and retries', async () => {
    const user = userEvent.setup()
    vi.mocked(ordersApi.getCustomerOrder)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(pendingOrder)

    renderCustomerOrderDetailPage()

    expect(
      await screen.findByRole('heading', { name: /could not load order/i }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(
      await screen.findByRole('heading', { name: pendingOrder.invoice_number }),
    ).toBeInTheDocument()
  })
})
