import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as customProjectsApi from '../../api/customProjectsApi'
import type { ApiErrorResponse } from '../../types/auth'
import type { CustomerCustomProject } from '../../types/customProject'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { CustomerProjectRequestPage } from './CustomerProjectRequestPage'

vi.mock('../../api/customProjectsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/customProjectsApi')>(
    '../../api/customProjectsApi',
  )
  return {
    ...actual,
    createCustomerCustomProject: vi.fn(),
  }
})

const createdProject: CustomerCustomProject = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Manual test chair',
  description: 'Need a game-ready wooden chair with PBR textures.',
  category: 'Furniture',
  status: 'submitted',
  payment_status: 'unpaid',
  estimated_budget: '150.00',
  currency: 'USD',
  deadline: null,
  assigned_designer: null,
  quotation: null,
  files: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function axiosStatusError(status: number, detail: string): AxiosError<ApiErrorResponse> {
  return new AxiosError(
    'Request failed',
    String(status),
    undefined,
    undefined,
    {
      status,
      statusText: 'Error',
      headers: {},
      config: { headers: {} } as never,
      data: { detail, code: 'error' },
    },
  )
}

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/dashboard/projects/new']}>
        <Routes>
          <Route path="/dashboard/projects" element={<div>My projects list</div>} />
          <Route path="/dashboard/projects/new" element={<CustomerProjectRequestPage />} />
          <Route
            path="/dashboard/projects/:projectId"
            element={<div>Project detail</div>}
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
})

describe('CustomerProjectRequestPage', () => {
  it('renders the request form', async () => {
    renderPage()

    expect(
      await screen.findByRole('heading', { name: /request a custom project/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/project title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit request/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to my projects/i })).toHaveAttribute(
      'href',
      '/dashboard/projects',
    )
  })

  it('validates required fields before submitting', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /submit request/i }))

    expect(
      await screen.findByText(/title must be at least 3 characters/i),
    ).toBeInTheDocument()
    expect(customProjectsApi.createCustomerCustomProject).not.toHaveBeenCalled()
  })

  it('submits a valid request and navigates to project detail', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.createCustomerCustomProject).mockResolvedValue(createdProject)
    renderPage()

    await user.type(await screen.findByLabelText(/project title/i), 'Manual test chair')
    await user.type(
      screen.getByLabelText(/description/i),
      'Need a game-ready wooden chair with PBR textures.',
    )
    await user.type(screen.getByLabelText(/category/i), 'Furniture')
    await user.type(screen.getByLabelText(/estimated budget/i), '150')
    await user.click(screen.getByRole('button', { name: /submit request/i }))

    await waitFor(() => {
      expect(customProjectsApi.createCustomerCustomProject).toHaveBeenCalled()
    })
    expect(customProjectsApi.createCustomerCustomProject.mock.calls[0]?.[0]).toEqual({
      title: 'Manual test chair',
      description: 'Need a game-ready wooden chair with PBR textures.',
      category: 'Furniture',
      currency: 'USD',
      estimated_budget: '150.00',
      deadline: null,
    })
    expect(await screen.findByText('Project detail')).toBeInTheDocument()
  })

  it('shows server error when create fails', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.createCustomerCustomProject).mockRejectedValue(
      axiosStatusError(400, 'Could not submit your project request.'),
    )
    renderPage()

    await user.type(await screen.findByLabelText(/project title/i), 'Manual test chair')
    await user.type(
      screen.getByLabelText(/description/i),
      'Need a game-ready wooden chair with PBR textures.',
    )
    await user.click(screen.getByRole('button', { name: /submit request/i }))

    expect(
      await screen.findByText('Could not submit your project request.'),
    ).toBeInTheDocument()
  })
})
