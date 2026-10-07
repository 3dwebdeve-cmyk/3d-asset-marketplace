import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as downloadsApi from '../../api/downloadsApi'
import * as ordersApi from '../../api/ordersApi'
import * as paymentsApi from '../../api/paymentsApi'
import { createTestQueryClient, resetAuthStore, testUser } from '../../test/test-utils'
import { useAuthStore } from '../../store/authStore'
import type { CustomerOrder } from '../../types/order'
import { CheckoutSuccessPage } from './CheckoutSuccessPage'

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

vi.mock('../../api/paymentsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/paymentsApi')>(
    '../../api/paymentsApi',
  )
  return {
    ...actual,
    confirmCheckoutSession: vi.fn(),
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

const paidOrder: CustomerOrder = {
  id: orderId,
  invoice_number: 'INV-20261007-ABCD',
  total_amount: '39.99',
  currency: 'USD',
  order_status: 'paid',
  payment_status: 'paid',
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
      can_download: true,
      files: [
        {
          id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          file_name: 'hero-sword.glb',
          file_format: 'glb',
          file_size: 2048,
          version: '1.0',
          download_url:
            '/api/v1/downloads/products/cccccccc-cccc-cccc-cccc-cccccccccccc/files/dddddddd-dddd-dddd-dddd-dddddddddddd/download/',
        },
      ],
      created_at: '2026-10-07T00:00:00Z',
      updated_at: '2026-10-07T00:00:00Z',
    },
  ],
  created_at: '2026-10-07T00:00:00Z',
  updated_at: '2026-10-07T00:00:00Z',
}

const pendingOrder: CustomerOrder = {
  ...paidOrder,
  order_status: 'pending',
  payment_status: 'pending',
  items: [{ ...paidOrder.items[0], can_download: false, files: [] }],
}

function renderCheckoutSuccessPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/checkout/success?order_id=${orderId}`]}>
        <Routes>
          <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
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
  vi.mocked(ordersApi.getCustomerOrder).mockResolvedValue(paidOrder)
  vi.mocked(paymentsApi.confirmCheckoutSession).mockResolvedValue({
    order_id: orderId,
    payment_status: 'pending',
    order_status: 'pending',
  })
})

describe('CheckoutSuccessPage', () => {
  it('shows per-file download buttons on the success card and downloads in place', async () => {
    const user = userEvent.setup()
    vi.mocked(downloadsApi.downloadCatalogFileByUrl).mockResolvedValue(undefined)
    renderCheckoutSuccessPage()

    const downloads = await screen.findByRole('region', { name: /your downloads/i })
    expect(within(downloads).getByText('Hero Sword')).toBeInTheDocument()
    expect(within(downloads).getByText(/GLB · 2\.0 KB/)).toBeInTheDocument()

    await user.click(within(downloads).getByRole('button', { name: /^download$/i }))
    expect(downloadsApi.downloadCatalogFileByUrl).toHaveBeenCalledWith(
      paidOrder.items[0].files[0].download_url,
      'hero-sword.glb',
    )
    expect(screen.queryByRole('button', { name: /download model/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /my downloads/i })).not.toBeInTheDocument()
  })

  it('downloads the invoice PDF from the success card', async () => {
    const user = userEvent.setup()
    vi.mocked(ordersApi.downloadCustomerOrderInvoice).mockResolvedValue(undefined)
    renderCheckoutSuccessPage()

    await user.click(await screen.findByRole('button', { name: /download invoice/i }))
    expect(ordersApi.downloadCustomerOrderInvoice).toHaveBeenCalledWith(
      orderId,
      paidOrder.invoice_number,
    )
    expect(screen.getByRole('link', { name: /view order/i })).toHaveAttribute(
      'href',
      `/dashboard/orders/${orderId}`,
    )
  })

  it('shows an error when the file download fails', async () => {
    const user = userEvent.setup()
    vi.mocked(downloadsApi.downloadCatalogFileByUrl).mockRejectedValue(new Error('boom'))
    renderCheckoutSuccessPage()

    const downloads = await screen.findByRole('region', { name: /your downloads/i })
    await user.click(within(downloads).getByRole('button', { name: /^download$/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('shows a download button when a paid item has no files yet', async () => {
    const user = userEvent.setup()
    vi.mocked(ordersApi.getCustomerOrder).mockResolvedValue({
      ...paidOrder,
      items: [{ ...paidOrder.items[0], files: [] }],
    })
    renderCheckoutSuccessPage()

    const downloads = await screen.findByRole('region', { name: /your downloads/i })
    await user.click(within(downloads).getByRole('button', { name: /^download$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no model file attached yet/i)
  })

  it('does not show download or invoice buttons while payment is pending', async () => {
    vi.mocked(ordersApi.getCustomerOrder).mockResolvedValue(pendingOrder)
    renderCheckoutSuccessPage()

    expect(
      await screen.findByRole('heading', { name: /confirming your payment/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /your downloads/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /download invoice/i })).not.toBeInTheDocument()
  })
})
