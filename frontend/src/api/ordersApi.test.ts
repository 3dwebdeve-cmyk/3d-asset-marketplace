import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from './client'
import {
  createAdminOrder,
  downloadAdminOrderInvoice,
  downloadCustomerOrderInvoice,
  getAdminOrder,
  getCustomerOrder,
  listAdminOrders,
  listCustomerOrders,
} from './ordersApi'
import type { AdminOrder, CustomerOrder } from '../types/order'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const orderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const customerId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const productId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const sampleOrder: AdminOrder = {
  id: orderId,
  invoice_number: 'INV-20260728-ABCD',
  total_amount: '59.98',
  currency: 'USD',
  order_status: 'pending',
  payment_status: 'pending',
  customer: {
    id: customerId,
    email: 'customer@example.com',
    full_name: 'Ada Customer',
  },
  items: [
    {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      product_type: 'product',
      product_id: productId,
      title: 'Oak Chair',
      slug: 'oak-chair',
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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ordersApi', () => {
  it('lists admin orders with filters and pagination', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: orderId,
            invoice_number: sampleOrder.invoice_number,
            total_amount: sampleOrder.total_amount,
            currency: sampleOrder.currency,
            order_status: sampleOrder.order_status,
            payment_status: sampleOrder.payment_status,
            customer: sampleOrder.customer,
            item_count: 1,
            created_at: sampleOrder.created_at,
            updated_at: sampleOrder.updated_at,
          },
        ],
      },
    })

    const result = await listAdminOrders({
      search: 'INV',
      order_status: 'pending',
      payment_status: 'pending',
      customer_id: customerId,
      ordering: '-created_at',
      page: 1,
      page_size: 20,
    })

    expect(result.count).toBe(1)
    expect(apiClient.get).toHaveBeenCalledWith(
      `/api/admin/orders/?search=INV&order_status=pending&payment_status=pending&customer_id=${customerId}&ordering=-created_at&page=1&page_size=20`,
    )
  })

  it('fetches a single admin order', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: sampleOrder })

    const result = await getAdminOrder(orderId)

    expect(result.invoice_number).toBe(sampleOrder.invoice_number)
    expect(apiClient.get).toHaveBeenCalledWith(`/api/admin/orders/${orderId}/`)
  })

  it('creates an admin order', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: sampleOrder })

    const payload = {
      customer_id: customerId,
      currency: 'USD',
      items: [{ product_type: 'product' as const, product_id: productId, quantity: 2 }],
    }
    const result = await createAdminOrder(payload)

    expect(result.id).toBe(orderId)
    expect(apiClient.post).toHaveBeenCalledWith('/api/admin/orders/', payload)
  })

  it('lists customer orders with filters and pagination', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: orderId,
            invoice_number: sampleOrder.invoice_number,
            total_amount: sampleOrder.total_amount,
            currency: sampleOrder.currency,
            order_status: sampleOrder.order_status,
            payment_status: sampleOrder.payment_status,
            item_count: 1,
            created_at: sampleOrder.created_at,
            updated_at: sampleOrder.updated_at,
          },
        ],
      },
    })

    const result = await listCustomerOrders({
      search: 'INV',
      order_status: 'pending',
      payment_status: 'pending',
      ordering: '-created_at',
      page: 1,
      page_size: 20,
    })

    expect(result.count).toBe(1)
    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/orders/?search=INV&order_status=pending&payment_status=pending&ordering=-created_at&page=1&page_size=20',
    )
  })

  it('fetches a single customer order', async () => {
    const customerOrder: CustomerOrder = {
      id: orderId,
      invoice_number: sampleOrder.invoice_number,
      total_amount: sampleOrder.total_amount,
      currency: sampleOrder.currency,
      order_status: sampleOrder.order_status,
      payment_status: sampleOrder.payment_status,
      item_count: 1,
      items: sampleOrder.items.map((item) => ({
        ...item,
        can_download: false,
        files: [],
      })),
      items_total: sampleOrder.items_total,
      created_at: sampleOrder.created_at,
      updated_at: sampleOrder.updated_at,
    }
    vi.mocked(apiClient.get).mockResolvedValue({ data: customerOrder })

    const result = await getCustomerOrder(orderId)

    expect(result.invoice_number).toBe(sampleOrder.invoice_number)
    expect(apiClient.get).toHaveBeenCalledWith(`/api/orders/${orderId}/`)
  })

  it('downloads a customer order invoice as a blob', async () => {
    const createObjectURL = vi.fn(() => 'blob:invoice')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    })
    const click = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      href: '',
      download: '',
    } as unknown as HTMLAnchorElement)
    vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob(['%PDF']) })

    await downloadCustomerOrderInvoice(orderId, sampleOrder.invoice_number)

    expect(apiClient.get).toHaveBeenCalledWith(`/api/orders/${orderId}/invoice/`, {
      responseType: 'blob',
    })
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:invoice')
  })

  it('downloads an admin order invoice as a blob', async () => {
    const createObjectURL = vi.fn(() => 'blob:admin-invoice')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    })
    const click = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      href: '',
      download: '',
    } as unknown as HTMLAnchorElement)
    vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob(['%PDF']) })

    await downloadAdminOrderInvoice(orderId, sampleOrder.invoice_number)

    expect(apiClient.get).toHaveBeenCalledWith(`/api/admin/orders/${orderId}/invoice/`, {
      responseType: 'blob',
    })
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:admin-invoice')
  })
})
