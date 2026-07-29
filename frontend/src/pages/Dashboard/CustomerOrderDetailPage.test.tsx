import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  }
})

const orderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const customerOrder: CustomerOrder = {
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
      quantity: 1,
      purchase_price: '39.99',
      line_total: '39.99',
      created_at: '2026-07-29T00:00:00Z',
      updated_at: '2026-07-29T00:00:00Z',
    },
  ],
  created_at: '2026-07-29T00:00:00Z',
  updated_at: '2026-07-29T00:00:00Z',
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
    refreshToken: 'refresh-token',
    user: testUser,
    isAuthenticated: true,
  })
  vi.mocked(ordersApi.getCustomerOrder).mockResolvedValue(customerOrder)
})

describe('CustomerOrderDetailPage', () => {
  it('renders line items with title, quantity, and price', async () => {
    renderCustomerOrderDetailPage()

    expect(await screen.findByRole('heading', { name: customerOrder.invoice_number })).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Hero Sword')).toBeInTheDocument()
    expect(within(table).getAllByText('USD 39.99')).toHaveLength(2)
    expect(within(table).getByText('1')).toBeInTheDocument()
  })

  it('shows disabled download controls with purchase messaging', async () => {
    renderCustomerOrderDetailPage()

    await screen.findByRole('heading', { name: customerOrder.invoice_number })
    const downloadButton = screen.getByRole('button', { name: /^download$/i })
    expect(downloadButton).toBeDisabled()
    expect(downloadButton).toHaveAttribute('title', 'Downloads available after purchase')
    expect(screen.getByText(/downloads available after purchase/i)).toBeInTheDocument()
  })

  it('shows error state and retries', async () => {
    const user = userEvent.setup()
    vi.mocked(ordersApi.getCustomerOrder)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(customerOrder)

    renderCustomerOrderDetailPage()

    expect(
      await screen.findByRole('heading', { name: /could not load order/i }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(
      await screen.findByRole('heading', { name: customerOrder.invoice_number }),
    ).toBeInTheDocument()
  })
})
