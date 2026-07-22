import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../../api/authApi'
import * as customProjectsApi from '../../api/customProjectsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminProjectDetailPage } from './AdminProjectDetailPage'

vi.mock('../../api/customProjectsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/customProjectsApi')>(
    '../../api/customProjectsApi',
  )
  return {
    ...actual,
    getAdminCustomProject: vi.fn(),
    updateAdminCustomProject: vi.fn(),
    upsertAdminCustomProjectQuotation: vi.fn(),
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

const projectId = '11111111-1111-1111-1111-111111111111'
const adminUser = {
  id: '33333333-3333-3333-3333-333333333333',
  email: 'admin@example.com',
  full_name: 'Admin Designer',
  role: 'Administrator' as const,
  phone: '',
  country: '',
  is_active: true,
  email_verified: true,
  date_joined: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const project = {
  id: projectId,
  title: 'Hero prop',
  description: 'Stylized sci-fi crate with baked lighting.',
  category: 'Props',
  status: 'submitted' as const,
  payment_status: 'unpaid' as const,
  estimated_budget: '150.00',
  currency: 'USD',
  deadline: '2026-08-01',
  admin_notes: '',
  customer: {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'customer@example.com',
    full_name: 'Ada Customer',
  },
  assigned_designer: null,
  quotation_amount: null,
  quotation: null,
  files: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[`/admin/projects/${projectId}`]}>
        <Routes>
          <Route path="/admin/projects/:projectId" element={<AdminProjectDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  vi.mocked(customProjectsApi.getAdminCustomProject).mockResolvedValue(project)
  vi.mocked(authApi.listAdminUsers).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [adminUser],
  })
})

describe('AdminProjectDetailPage', () => {
  it('loads project fields and saves review updates', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.updateAdminCustomProject).mockResolvedValue({
      ...project,
      status: 'under_review',
      admin_notes: 'Feasible this sprint.',
      assigned_designer: {
        id: adminUser.id,
        email: adminUser.email,
        full_name: adminUser.full_name,
      },
    })
    renderPage()
    expect(await screen.findByDisplayValue('Hero prop')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Status'), 'under_review')
    await user.selectOptions(screen.getByLabelText('Assigned designer'), adminUser.id)
    await user.type(screen.getByLabelText('Admin notes'), 'Feasible this sprint.')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(customProjectsApi.updateAdminCustomProject).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({
          status: 'under_review',
          assigned_designer_id: adminUser.id,
          admin_notes: 'Feasible this sprint.',
        }),
      )
    })
  })

  it('saves a quotation', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.upsertAdminCustomProjectQuotation).mockResolvedValue({
      quotation: {
        id: '44444444-4444-4444-4444-444444444444',
        amount: '220.00',
        currency: 'USD',
        estimated_delivery: '2026-08-20',
        notes: 'Includes two revision rounds.',
        status: 'pending',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      project: {
        ...project,
        status: 'quoted',
        quotation_amount: '220.00',
      },
    })
    renderPage()
    await screen.findByDisplayValue('Hero prop')
    await user.type(screen.getByLabelText('Amount'), '220')
    await user.type(screen.getByLabelText('Notes'), 'Includes two revision rounds.')
    await user.click(screen.getByRole('button', { name: 'Save quotation' }))
    await waitFor(() => {
      expect(customProjectsApi.upsertAdminCustomProjectQuotation).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({
          amount: '220.00',
          notes: 'Includes two revision rounds.',
        }),
      )
    })
  })
})
