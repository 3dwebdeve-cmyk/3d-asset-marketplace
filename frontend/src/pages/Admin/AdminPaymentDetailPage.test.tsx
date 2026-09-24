import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as paymentsApi from '../../api/paymentsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminPaymentDetailPage } from './AdminPaymentDetailPage'

vi.mock('../../api/paymentsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/paymentsApi')>(
    '../../api/paymentsApi',
  )
  return {
    ...actual,
    getAdminPayment: vi.fn(),
  }
})

const paymentId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const orderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const payment = {
  id: paymentId,
  created_at: '2026-07-31T10:00:00Z',
  updated_at: '2026-07-31T10:05:00Z',
  customer_email: 'payer@example.com',
  customer_full_name: 'Payer Customer',
  amount: '49.99',
  currency: 'USD',
  status: 'succeeded' as const,
  gateway: 'stripe',
  stripe_checkout_session_id: 'cs_test_succeeded_1',
  stripe_payment_intent_id: 'pi_test_succeeded_1',
  order: {
    id: orderId,
    invoice_number: 'INV-20260731-PAY1',
    order_status: 'paid',
    payment_status: 'paid',
    total_amount: '49.99',
    currency: 'USD',
  },
}

function renderPaymentDetailPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/console/payments/${paymentId}`]}>
        <Routes>
          <Route
            path="/console/payments/:paymentId"
            element={<AdminPaymentDetailPage />}
          />
          <Route path="/console/payments" element={<div>Payments list</div>} />
          <Route path="/console/orders/:orderId" element={<div>Order detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  vi.mocked(paymentsApi.getAdminPayment).mockResolvedValue(payment)
})

describe('AdminPaymentDetailPage', () => {
  it('renders payment detail with stripe refs and order link', async () => {
    renderPaymentDetailPage()

    await waitFor(() => {
      expect(screen.getByText(/payer customer/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/cs_test_succeeded_1/i)).toBeInTheDocument()
    expect(screen.getByText(/pi_test_succeeded_1/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view order/i })).toHaveAttribute(
      'href',
      `/console/orders/${orderId}`,
    )
    expect(screen.getByRole('link', { name: /back to payments/i })).toHaveAttribute(
      'href',
      '/console/payments',
    )
  })

  it('shows error state and retries', async () => {
    const user = userEvent.setup()
    vi.mocked(paymentsApi.getAdminPayment)
      .mockRejectedValueOnce(new Error('Not found'))
      .mockResolvedValueOnce(payment)

    renderPaymentDetailPage()

    await waitFor(() => {
      expect(screen.getByText(/could not load payment/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByText(/payer customer/i)).toBeInTheDocument()
    })
  })
})
