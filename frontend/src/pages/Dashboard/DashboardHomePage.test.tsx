import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as customProjectsApi from '../../api/customProjectsApi'
import * as downloadsApi from '../../api/downloadsApi'
import * as ordersApi from '../../api/ordersApi'
import * as wishlistApi from '../../api/wishlistApi'
import { useAuthStore } from '../../store/authStore'
import { createTestQueryClient, resetAuthStore, testUser } from '../../test/test-utils'
import { DashboardHomePage } from './DashboardHomePage'

vi.mock('../../api/customProjectsApi', () => ({
  listCustomerCustomProjects: vi.fn(),
}))

vi.mock('../../api/ordersApi', () => ({
  listCustomerOrders: vi.fn(),
}))

vi.mock('../../api/wishlistApi', () => ({
  listWishlistItems: vi.fn(),
}))

vi.mock('../../api/downloadsApi', () => ({
  listDownloadEntitlements: vi.fn(),
}))

function renderHome() {
  const queryClient = createTestQueryClient()
  useAuthStore.setState({
    accessToken: 'test-access-token',
    user: { ...testUser, full_name: 'Abhay Kumar' },
    isAuthenticated: true,
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardHomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  vi.clearAllMocks()
})

describe('DashboardHomePage', () => {
  it('renders greeting, summary cards, and quick actions from API data', async () => {
    vi.mocked(customProjectsApi.listCustomerCustomProjects).mockResolvedValue({
      count: 4,
      next: null,
      previous: null,
      results: [
        {
          id: 'p1',
          title: 'A',
          category: 'general',
          status: 'in_progress',
          payment_status: 'paid',
          estimated_budget: null,
          currency: 'USD',
          deadline: null,
          assigned_designer: null,
          quotation_amount: null,
          unread_count: 0,
          has_unread: false,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'p2',
          title: 'B',
          category: 'general',
          status: 'in_progress',
          payment_status: 'paid',
          estimated_budget: null,
          currency: 'USD',
          deadline: null,
          assigned_designer: null,
          quotation_amount: null,
          unread_count: 0,
          has_unread: false,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'p3',
          title: 'C',
          category: 'general',
          status: 'approved',
          payment_status: 'unpaid',
          estimated_budget: null,
          currency: 'USD',
          deadline: null,
          assigned_designer: null,
          quotation_amount: null,
          unread_count: 0,
          has_unread: false,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'p4',
          title: 'D',
          category: 'general',
          status: 'completed',
          payment_status: 'paid',
          estimated_budget: null,
          currency: 'USD',
          deadline: null,
          assigned_designer: null,
          quotation_amount: null,
          unread_count: 0,
          has_unread: false,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
    })

    vi.mocked(ordersApi.listCustomerOrders).mockResolvedValue({
      count: 12,
      next: null,
      previous: null,
      results: [
        {
          id: 'o1',
          invoice_number: 'INV-1',
          total_amount: '400.00',
          currency: 'USD',
          order_status: 'paid',
          payment_status: 'paid',
          item_count: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'o2',
          invoice_number: 'INV-2',
          total_amount: '275.00',
          currency: 'USD',
          order_status: 'paid',
          payment_status: 'paid',
          item_count: 2,
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
        {
          id: 'o3',
          invoice_number: 'INV-3',
          total_amount: '50.00',
          currency: 'USD',
          order_status: 'pending',
          payment_status: 'pending',
          item_count: 1,
          created_at: '2024-01-03T00:00:00Z',
          updated_at: '2024-01-03T00:00:00Z',
        },
      ],
    })

    vi.mocked(wishlistApi.listWishlistItems).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    vi.mocked(downloadsApi.listDownloadEntitlements).mockResolvedValue([
      {
        product_type: 'product',
        product_id: 'prod-1',
        title: 'Model A',
        slug: 'model-a',
        files: [],
      },
    ])

    renderHome()

    expect(screen.getByRole('heading', { name: /welcome back, abhay!/i })).toBeInTheDocument()
    expect(
      screen.getByText(/manage your 3d assets, orders, custom projects, and account settings/i),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('4')).toBeInTheDocument()
    })

    expect(screen.getByText(/2 in progress · 1 approved/i)).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText(/\$675\.00 lifetime spend/i)).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText(/browse models & plugins/i)).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText(/ready for instant download/i)).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /view projects/i })).toHaveAttribute(
      'href',
      '/dashboard/projects',
    )
    expect(screen.getByRole('link', { name: /saved wishlist/i })).toHaveAttribute(
      'href',
      '/dashboard/wishlist',
    )
    expect(screen.getByRole('link', { name: /orders history/i })).toHaveAttribute(
      'href',
      '/dashboard/orders',
    )
    expect(screen.getByRole('link', { name: /^downloads$/i })).toHaveAttribute(
      'href',
      '/dashboard/downloads',
    )
    expect(screen.getByRole('link', { name: /edit profile/i })).toHaveAttribute(
      'href',
      '/profile',
    )
  })

  it('keeps rendering when one summary query fails', async () => {
    vi.mocked(customProjectsApi.listCustomerCustomProjects).mockRejectedValue(
      new Error('projects down'),
    )
    vi.mocked(ordersApi.listCustomerOrders).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [],
    })
    vi.mocked(wishlistApi.listWishlistItems).mockResolvedValue({
      count: 3,
      next: null,
      previous: null,
      results: [],
    })
    vi.mocked(downloadsApi.listDownloadEntitlements).mockResolvedValue([])

    renderHome()

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText(/could not load project details/i)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /quick actions/i })).toBeInTheDocument()
  })
})
