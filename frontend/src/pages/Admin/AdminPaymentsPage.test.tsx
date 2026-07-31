import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as paymentsApi from '../../api/paymentsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminPaymentsPage } from './AdminPaymentsPage'

vi.mock('../../api/paymentsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/paymentsApi')>(
    '../../api/paymentsApi',
  )
  return {
    ...actual,
    listAdminPayments: vi.fn(),
  }
})

const payment = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  created_at: '2026-07-31T10:00:00Z',
  updated_at: '2026-07-31T10:05:00Z',
  customer_email: 'payer@example.com',
  invoice_number: 'INV-20260731-PAY1',
  order_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  amount: '49.99',
  currency: 'USD',
  status: 'succeeded' as const,
  gateway: 'stripe',
  stripe_checkout_session_id: 'cs_test_succeeded_1',
  stripe_payment_intent_id: 'pi_test_succeeded_1',
}

function renderPaymentsPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/payments']}>
        <Routes>
          <Route path="/admin/payments" element={<AdminPaymentsPage />} />
          <Route
            path="/admin/payments/:paymentId"
            element={<div>Payment detail</div>}
          />
          <Route path="/admin/orders/:orderId" element={<div>Order detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  vi.mocked(paymentsApi.listAdminPayments).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [payment],
  })
})

describe('AdminPaymentsPage', () => {
  it('renders payment rows with order and detail links', async () => {
    renderPaymentsPage()

    expect(screen.getByRole('heading', { name: /payments/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('payer@example.com')).toBeInTheDocument()
    })

    expect(screen.getByText('USD 49.99')).toBeInTheDocument()
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: payment.invoice_number })).toHaveAttribute(
      'href',
      `/admin/orders/${payment.order_id}`,
    )
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute(
      'href',
      `/admin/payments/${payment.id}`,
    )
  })

  it('shows empty state when no payments match', async () => {
    vi.mocked(paymentsApi.listAdminPayments).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    renderPaymentsPage()

    await waitFor(() => {
      expect(screen.getByText(/no payments match your filters/i)).toBeInTheDocument()
    })
  })

  it('shows error state and retries', async () => {
    const user = userEvent.setup()
    vi.mocked(paymentsApi.listAdminPayments)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        count: 1,
        next: null,
        previous: null,
        results: [payment],
      })

    renderPaymentsPage()

    await waitFor(() => {
      expect(screen.getByText(/could not load payments/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByText('payer@example.com')).toBeInTheDocument()
    })
  })

  it('applies status filter when changed', async () => {
    const user = userEvent.setup()
    renderPaymentsPage()

    await waitFor(() => {
      expect(paymentsApi.listAdminPayments).toHaveBeenCalled()
    })

    await user.selectOptions(screen.getByLabelText(/filter by payment status/i), 'paid')

    await waitFor(() => {
      expect(paymentsApi.listAdminPayments).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paid', page: 1 }),
      )
    })
  })
})
