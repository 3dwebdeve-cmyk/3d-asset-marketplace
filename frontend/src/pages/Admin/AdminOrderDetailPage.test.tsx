import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as ordersApi from '../../api/ordersApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminOrderDetailPage } from './AdminOrderDetailPage'

vi.mock('../../api/ordersApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/ordersApi')>(
    '../../api/ordersApi',
  )
  return {
    ...actual,
    getAdminOrder: vi.fn(),
  }
})

const orderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const productId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const sampleOrder = {
  id: orderId,
  invoice_number: 'INV-20260728-ABCD',
  total_amount: '59.98',
  currency: 'USD',
  order_status: 'pending' as const,
  payment_status: 'pending' as const,
  customer: {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'customer@example.com',
    full_name: 'Ada Customer',
  },
  items: [
    {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      product_type: 'product' as const,
      product_id: productId,
      title: 'Oak Chair',
      quantity: 2,
      purchase_price: '29.99',
      line_total: '59.98',
      created_at: '2026-07-28T00:00:00Z',
      updated_at: '2026-07-28T00:00:00Z',
    },
  ],
  items_total: '59.98',
  created_at: '2026-07-28T00:00:00Z',
  updated_at: '2026-07-28T00:00:00Z',
}

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[`/admin/orders/${orderId}`]}>
        <Routes>
          <Route path="/admin/orders/:orderId" element={<AdminOrderDetailPage />} />
          <Route path="/admin/orders" element={<div>Orders list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  vi.mocked(ordersApi.getAdminOrder).mockResolvedValue(sampleOrder)
})

describe('AdminOrderDetailPage', () => {
  it('renders order summary and line items', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'INV-20260728-ABCD' })).toBeInTheDocument()
    expect(screen.getByText(/Ada Customer/)).toBeInTheDocument()
    expect(screen.getByText('Oak Chair')).toBeInTheDocument()
    expect(screen.getByText(productId)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to orders/i })).toHaveAttribute(
      'href',
      '/admin/orders',
    )
  })

  it('shows an error state when the order cannot be loaded', async () => {
    vi.mocked(ordersApi.getAdminOrder).mockRejectedValue(new Error('Not found'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/could not load order/i)).toBeInTheDocument()
    })
  })
})
