import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../../api/authApi'
import * as customProjectsApi from '../../api/customProjectsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminProjectsPage } from './AdminProjectsPage'

vi.mock('../../api/customProjectsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/customProjectsApi')>(
    '../../api/customProjectsApi',
  )
  return {
    ...actual,
    listAdminCustomProjects: vi.fn(),
    createAdminCustomProject: vi.fn(),
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

const project = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Hero prop',
  category: 'Props',
  status: 'submitted' as const,
  payment_status: 'unpaid' as const,
  estimated_budget: '150.00',
  currency: 'USD',
  deadline: '2026-08-01',
  customer: {
    id: customer.id,
    email: customer.email,
    full_name: customer.full_name,
  },
  assigned_designer: null,
  quotation_amount: null,
  unread_count: 0,
  has_unread: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/admin/projects']}>
        <Routes>
          <Route path="/admin/projects" element={<AdminProjectsPage />} />
          <Route
            path="/admin/projects/:projectId"
            element={<div>Project detail page</div>}
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
  vi.mocked(customProjectsApi.listAdminCustomProjects).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [project],
  })
  vi.mocked(authApi.listAdminUsers).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [customer],
  })
})

describe('AdminProjectsPage', () => {
  it('lists custom projects', async () => {
    renderPage()
    expect(await screen.findByText('Hero prop')).toBeInTheDocument()
    expect(screen.getByText('Ada Customer')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      `/admin/projects/${project.id}`,
    )
  })

  it('shows an unread badge when a project has unread messages', async () => {
    vi.mocked(customProjectsApi.listAdminCustomProjects).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ ...project, unread_count: 3, has_unread: true }],
    })

    renderPage()

    expect(await screen.findByText('Hero prop')).toBeInTheDocument()
    expect(screen.getByLabelText('3 unread messages')).toHaveTextContent('3')
  })

  it('creates a project for a customer', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.createAdminCustomProject).mockResolvedValue({
      ...project,
      description: 'Need a game-ready wooden chair with PBR textures.',
      admin_notes: '',
      quotation: null,
      files: [],
    })
    renderPage()
    await screen.findByText('Hero prop')
    await user.click(screen.getByRole('button', { name: 'Create project for customer' }))
    await user.selectOptions(
      await screen.findByLabelText('Customer'),
      customer.id,
    )
    await user.type(screen.getByLabelText('Title'), 'Custom chair model')
    await user.type(
      screen.getByLabelText('Description'),
      'Need a game-ready wooden chair with PBR textures.',
    )
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => {
      expect(customProjectsApi.createAdminCustomProject).toHaveBeenCalled()
    })
    expect(vi.mocked(customProjectsApi.createAdminCustomProject).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        customer_id: customer.id,
        title: 'Custom chair model',
      }),
    )
    expect(await screen.findByText('Project detail page')).toBeInTheDocument()
  })
})
