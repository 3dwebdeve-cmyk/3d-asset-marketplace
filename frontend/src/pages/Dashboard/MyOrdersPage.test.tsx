import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as ordersApi from '../../api/ordersApi'
import { createTestQueryClient, resetAuthStore, testUser } from '../../test/test-utils'
import { useAuthStore } from '../../store/authStore'
import type { CustomerOrderListItem } from '../../types/order'
import { MyOrdersPage } from './MyOrdersPage'

vi.mock('../../api/ordersApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/ordersApi')>(
    '../../api/ordersApi',
  )
  return {
    ...actual,
    listCustomerOrders: vi.fn(),
    downloadCustomerOrderInvoice: vi.fn(),
  }
})

const orderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const orderListItem: CustomerOrderListItem = {
  id: orderId,
  invoice_number: 'INV-20260729-ABCD',
  total_amount: '59.98',
  currency: 'USD',
  order_status: 'pending',
  payment_status: 'pending',
  item_count: 2,
  created_at: '2026-07-29T00:00:00Z',
  updated_at: '2026-07-29T00:00:00Z',
}

function renderMyOrdersPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MyOrdersPage />
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
  vi.mocked(ordersApi.listCustomerOrders).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [orderListItem],
  })
})

describe('MyOrdersPage', () => {
  it('shows loading state initially', () => {
    vi.mocked(ordersApi.listCustomerOrders).mockImplementation(
      () => new Promise(() => undefined),
    )
    renderMyOrdersPage()
    expect(screen.getByRole('status')).toHaveTextContent(/loading your orders/i)
  })

  it('renders order rows with invoice and status labels', async () => {
    renderMyOrdersPage()
    expect(await screen.findByRole('link', { name: orderListItem.invoice_number })).toHaveAttribute(
      'href',
      `/dashboard/orders/${orderId}`,
    )
    expect(screen.getAllByLabelText('Status: Pending')).toHaveLength(2)
  })

  it('requests all order types', async () => {
    renderMyOrdersPage()
    await screen.findByRole('link', { name: orderListItem.invoice_number })
    const params = vi.mocked(ordersApi.listCustomerOrders).mock.calls[0][0]
    expect(params).not.toHaveProperty('item_type')
  })

  it('hides invoice download for unpaid orders', async () => {
    renderMyOrdersPage()
    await screen.findByRole('link', { name: orderListItem.invoice_number })
    expect(screen.queryByRole('button', { name: /download invoice/i })).not.toBeInTheDocument()
  })

  it('downloads the invoice PDF for paid orders', async () => {
    const user = userEvent.setup()
    const paidOrder = { ...orderListItem, order_status: 'paid', payment_status: 'paid' } as const
    vi.mocked(ordersApi.listCustomerOrders).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [paidOrder],
    })
    vi.mocked(ordersApi.downloadCustomerOrderInvoice).mockResolvedValue(undefined)
    renderMyOrdersPage()

    await user.click(
      await screen.findByRole('button', {
        name: `Download invoice ${paidOrder.invoice_number}`,
      }),
    )
    expect(ordersApi.downloadCustomerOrderInvoice).toHaveBeenCalledWith(
      paidOrder.id,
      paidOrder.invoice_number,
    )
  })

  it('shows empty state when the customer has no orders', async () => {
    vi.mocked(ordersApi.listCustomerOrders).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    renderMyOrdersPage()

    expect(await screen.findByText(/you have no orders yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /browse 3d models/i })).toHaveAttribute(
      'href',
      '/3d-models',
    )
  })

  it('shows error state and retries', async () => {
    const user = userEvent.setup()
    vi.mocked(ordersApi.listCustomerOrders)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        count: 1,
        next: null,
        previous: null,
        results: [orderListItem],
      })

    renderMyOrdersPage()

    expect(
      await screen.findByRole('heading', { name: /could not load your orders/i }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(
      await screen.findByRole('link', { name: orderListItem.invoice_number }),
    ).toBeInTheDocument()
  })
})
