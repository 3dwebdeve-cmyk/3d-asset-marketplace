import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from './client'
import { createCheckoutSession, getAdminPayment, listAdminPayments } from './paymentsApi'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createCheckoutSession', () => {
  it('sends the immediate-access consent with the legal versions and items', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { checkout_url: 'u', order_id: 'o' } })
    const items = [{ product_type: 'plugin' as const, product_id: 'p1' }]

    await createCheckoutSession({ terms: 't', privacy: 'p' }, items)

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/payments/checkout/',
      { accepted_legal: { terms: 't', privacy: 'p' }, withdrawal_waiver: true, items },
      expect.anything(),
    )
  })
})

describe('paymentsApi admin helpers', () => {
  it('lists admin payments with filters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })

    await listAdminPayments({
      search: 'INV',
      status: 'paid',
      created_after: '2026-07-01',
      created_before: '2026-07-31',
      ordering: '-amount',
      page: 2,
      page_size: 20,
    })

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/admin/payments/?search=INV&status=paid&created_after=2026-07-01&created_before=2026-07-31&ordering=-amount&page=2&page_size=20',
    )
  })

  it('fetches admin payment detail', async () => {
    const paymentId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    vi.mocked(apiClient.get).mockResolvedValue({ data: { id: paymentId } })

    await getAdminPayment(paymentId)

    expect(apiClient.get).toHaveBeenCalledWith(`/api/v1/admin/payments/${paymentId}/`)
  })
})
