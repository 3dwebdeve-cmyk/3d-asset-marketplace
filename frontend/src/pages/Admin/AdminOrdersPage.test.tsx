import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../../api/authApi'
import * as ordersApi from '../../api/ordersApi'
import * as pluginsApi from '../../api/pluginsApi'
import * as productsApi from '../../api/productsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminOrdersPage } from './AdminOrdersPage'

vi.mock('../../api/ordersApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/ordersApi')>(
    '../../api/ordersApi',
  )
  return {
    ...actual,
    listAdminOrders: vi.fn(),
    createAdminOrder: vi.fn(),
  }
})

vi.mock('../../api/authApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/authApi')>(
    '../../api/authApi',
  )
  return {
    ...actual,
    listAdminUsers: vi.fn(),
  }
})

vi.mock('../../api/productsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/productsApi')>(
    '../../api/productsApi',
  )
  return {
    ...actual,
    listAdminProducts: vi.fn(),
  }
})

vi.mock('../../api/pluginsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/pluginsApi')>(
    '../../api/pluginsApi',
  )
  return {
    ...actual,
    listAdminPlugins: vi.fn(),
  }
})

const customer = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'customer@example.com',
  full_name: 'Ada Customer',
  role: 'Customer' as const,
  phone: '',
  country: '',
  is_active: true,
  email_verified: true,
  avatar: '',
  is_staff: false,
  date_joined: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const productId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const orderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const order = {
  id: orderId,
  invoice_number: 'INV-20260728-ABCD',
  total_amount: '59.98',
  currency: 'USD',
  order_status: 'pending' as const,
  payment_status: 'pending' as const,
  customer: {
    id: customer.id,
    email: customer.email,
    full_name: customer.full_name,
  },
  item_count: 2,
  created_at: '2026-07-28T00:00:00Z',
  updated_at: '2026-07-28T00:00:00Z',
}

const sampleProduct = {
  id: productId,
  name: 'Oak Chair',
  slug: 'oak-chair',
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
  software_used: '',
  animated: false,
  rigged: false,
  pbr_ready: false,
  game_ready: false,
  license_type: 'standard' as const,
  average_rating: '0.00',
  total_downloads: 0,
  status: 'published' as const,
  category: {
    id: '44bba207-8a0c-490d-abdf-5a383ed2111b',
    name: 'Furniture',
    slug: 'furniture',
  },
  images: [],
  files: [],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/admin/orders']}>
        <Routes>
          <Route path="/admin/orders" element={<AdminOrdersPage />} />
          <Route
            path="/admin/orders/:orderId"
            element={<div>Order detail page</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  vi.mocked(ordersApi.listAdminOrders).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [order],
  })
  vi.mocked(authApi.listAdminUsers).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [customer],
  })
  vi.mocked(productsApi.listAdminProducts).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [sampleProduct],
  })
  vi.mocked(pluginsApi.listAdminPlugins).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
})

describe('AdminOrdersPage', () => {
  it('lists marketplace orders', async () => {
    renderPage()
    expect(await screen.findByText('INV-20260728-ABCD')).toBeInTheDocument()
    expect(screen.getByText('Ada Customer')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      `/admin/orders/${order.id}`,
    )
  })

  it('creates an order for a customer', async () => {
    const user = userEvent.setup()
    vi.mocked(ordersApi.createAdminOrder).mockResolvedValue({
      ...order,
      items: [
        {
          id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          product_type: 'product',
          product_id: productId,
          title: 'Oak Chair',
          quantity: 2,
          purchase_price: '29.99',
          line_total: '59.98',
          created_at: order.created_at,
          updated_at: order.updated_at,
        },
      ],
      items_total: '59.98',
    })

    renderPage()
    await screen.findByText('INV-20260728-ABCD')
    await user.click(screen.getByRole('button', { name: 'Create order for customer' }))
    await user.selectOptions(await screen.findByLabelText('Customer'), customer.id)
    await user.selectOptions(await screen.findByLabelText('Product'), productId)
    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '2')
    await user.click(screen.getByRole('button', { name: 'Create order' }))

    await waitFor(() => {
      expect(ordersApi.createAdminOrder).toHaveBeenCalled()
    })
    expect(vi.mocked(ordersApi.createAdminOrder).mock.calls[0]?.[0]).toEqual({
      customer_id: customer.id,
      currency: 'USD',
      items: [{ product_type: 'product', product_id: productId, quantity: 2 }],
    })
    expect(await screen.findByText('Order detail page')).toBeInTheDocument()
  })
})
