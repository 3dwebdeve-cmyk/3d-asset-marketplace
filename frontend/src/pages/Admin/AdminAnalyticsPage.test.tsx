import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as analyticsApi from '../../api/analyticsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import type { AdminAnalytics } from '../../types/analytics'
import { AdminAnalyticsPage } from './AdminAnalyticsPage'

vi.mock('../../api/analyticsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/analyticsApi')>(
    '../../api/analyticsApi',
  )
  return {
    ...actual,
    getAdminAnalytics: vi.fn(),
  }
})

const sampleAnalytics: AdminAnalytics = {
  filters: { start_date: '2026-08-01', end_date: '2026-08-03' },
  currency: 'USD',
  summary: {
    order_count: 3,
    paid_order_count: 2,
    pending_order_count: 1,
    refunded_order_count: 0,
    cancelled_order_count: 0,
    revenue: '150.00',
    average_order_value: '75.00',
  },
  revenue_by_period: [{ period: '2026-08', order_count: 2, revenue: '150.00' }],
  top_products: [
    {
      product_id: '11111111-1111-1111-1111-111111111111',
      product_type: 'product',
      title: 'Oak Chair',
      slug: 'oak-chair',
      quantity_sold: 3,
      order_count: 2,
      revenue: '120.00',
    },
  ],
  top_plugins: [
    {
      product_id: '22222222-2222-2222-2222-222222222222',
      product_type: 'plugin',
      title: 'Mesh Toolkit',
      slug: 'mesh-toolkit',
      quantity_sold: 1,
      order_count: 1,
      revenue: '30.00',
    },
  ],
  gateway_breakdown: [{ gateway: 'stripe', payment_count: 2, revenue: '150.00' }],
}

function renderAnalyticsPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminAnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  vi.mocked(analyticsApi.getAdminAnalytics).mockResolvedValue(sampleAnalytics)
})

describe('AdminAnalyticsPage', () => {
  it('renders summary cards, period table, and top sellers', async () => {
    renderAnalyticsPage()

    expect(screen.getByRole('heading', { name: /^analytics$/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('From 2 paid orders')).toBeInTheDocument()
    })

    expect(screen.getByText('Oak Chair')).toBeInTheDocument()
    expect(screen.getByText('Mesh Toolkit')).toBeInTheDocument()
    expect(screen.getByText('stripe')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View orders' })).toHaveAttribute(
      'href',
      '/admin/orders',
    )
    expect(screen.getByRole('link', { name: 'View payments' })).toHaveAttribute(
      'href',
      '/admin/payments',
    )
  })

  it('shows empty states when there is no sales data', async () => {
    vi.mocked(analyticsApi.getAdminAnalytics).mockResolvedValue({
      ...sampleAnalytics,
      revenue_by_period: [],
      top_products: [],
      top_plugins: [],
      gateway_breakdown: [],
      summary: {
        ...sampleAnalytics.summary,
        order_count: 0,
        paid_order_count: 0,
        revenue: '0.00',
        average_order_value: '0.00',
      },
    })

    renderAnalyticsPage()

    await waitFor(() => {
      expect(screen.getByText(/no paid orders in this date range/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/no product sales in this date range/i)).toBeInTheDocument()
    expect(screen.getByText(/no plugin sales in this date range/i)).toBeInTheDocument()
    expect(
      screen.getByText(/no succeeded gateway payments in this date range/i),
    ).toBeInTheDocument()
  })

  it('shows error state with retry', async () => {
    const user = userEvent.setup()
    vi.mocked(analyticsApi.getAdminAnalytics)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(sampleAnalytics)

    renderAnalyticsPage()

    await waitFor(() => {
      expect(screen.getByText(/could not load analytics/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByText('From 2 paid orders')).toBeInTheDocument()
    })
  })

  it('refetches when date filters change', async () => {
    const user = userEvent.setup()
    renderAnalyticsPage()

    await waitFor(() => {
      expect(analyticsApi.getAdminAnalytics).toHaveBeenCalled()
    })

    const startInput = screen.getByLabelText('Start date')
    await user.clear(startInput)
    await user.type(startInput, '2026-07-01')

    await waitFor(() => {
      expect(analyticsApi.getAdminAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({ start_date: '2026-07-01' }),
      )
    })
  })
})
