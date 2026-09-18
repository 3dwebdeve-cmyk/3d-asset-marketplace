import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as dashboardApi from '../../api/dashboardApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminDashboardPage } from './AdminDashboardPage'

vi.mock('../../api/dashboardApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/dashboardApi')>(
    '../../api/dashboardApi',
  )
  return {
    ...actual,
    getAdminDashboardStats: vi.fn(),
  }
})

const sampleStats = {
  users: { total: 12, active: 10 },
  products: { total: 8, published: 5, draft: 2, archived: 1 },
  categories: { total: 4, live: 3 },
  plugins: { total: 0 },
  projects: { pending: 0, live: 0, completed: 0 },
  sales: { monthly_revenue: '0.00', monthly_orders: 0, currency: 'USD' },
  payments: { succeeded: 2, pending: 1 },
  category_breakdown: [
    {
      id: '44bba207-8a0c-490d-abdf-5a383ed2111b',
      name: 'Furniture',
      slug: 'furniture',
      is_active: true,
      product_count: 4,
      published_product_count: 3,
    },
    {
      id: '55cba318-9b1d-501e-bc0e-6b494fe3222c',
      name: 'Architecture',
      slug: 'architecture',
      is_active: true,
      product_count: 1,
      published_product_count: 1,
    },
  ],
}

function renderDashboardPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  vi.mocked(dashboardApi.getAdminDashboardStats).mockResolvedValue(sampleStats)
})

describe('AdminDashboardPage', () => {
  it('renders dashboard stat cards and category breakdown', async () => {
    renderDashboardPage()

    expect(screen.getByRole('heading', { name: /admin dashboard/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('12 total accounts')).toBeInTheDocument()
    })

    expect(screen.getByText('8 total · 2 draft · 1 archived')).toBeInTheDocument()
    expect(screen.getByText('4 categories overall')).toBeInTheDocument()
    expect(screen.getByText('Furniture')).toBeInTheDocument()
    expect(screen.getByText('Architecture')).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
    expect(screen.getByText('Paid payments')).toBeInTheDocument()
    expect(
      screen.getByText((_, element) => element?.textContent === '1 pending · View payments'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View payments' })).toHaveAttribute(
      'href',
      '/console/payments',
    )
    expect(screen.getByRole('link', { name: 'Manage plugins' })).toHaveAttribute(
      'href',
      '/console/plugins',
    )
    expect(screen.getByRole('link', { name: 'Manage orders' })).toHaveAttribute(
      'href',
      '/console/orders',
    )
    expect(screen.getByRole('link', { name: 'Manage payments' })).toHaveAttribute(
      'href',
      '/console/payments',
    )
    expect(dashboardApi.getAdminDashboardStats).toHaveBeenCalledTimes(1)
  })

  it('retries when stats fail to load', async () => {
    const user = userEvent.setup()
    vi.mocked(dashboardApi.getAdminDashboardStats)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(sampleStats)

    renderDashboardPage()

    await waitFor(() => {
      expect(screen.getByText(/could not load dashboard stats/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByText('Furniture')).toBeInTheDocument()
    })
    expect(dashboardApi.getAdminDashboardStats).toHaveBeenCalledTimes(2)
  })
})
