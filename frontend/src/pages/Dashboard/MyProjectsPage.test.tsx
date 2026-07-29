import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as customProjectsApi from '../../api/customProjectsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { MyProjectsPage } from './MyProjectsPage'

vi.mock('../../api/customProjectsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/customProjectsApi')>(
    '../../api/customProjectsApi',
  )
  return {
    ...actual,
    listCustomerCustomProjects: vi.fn(),
  }
})

const project = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Hero prop',
  category: 'Props',
  status: 'quoted' as const,
  payment_status: 'unpaid' as const,
  estimated_budget: '150.00',
  currency: 'USD',
  deadline: '2026-08-01',
  assigned_designer: null,
  quotation_amount: '175.00',
  unread_count: 0,
  has_unread: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-15T12:00:00Z',
}

const unquotedProject = {
  ...project,
  id: '22222222-2222-2222-2222-222222222222',
  title: 'Unquoted sketch',
  status: 'submitted' as const,
  quotation_amount: null,
}

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/dashboard/projects']}>
        <Routes>
          <Route path="/dashboard/projects" element={<MyProjectsPage />} />
          <Route
            path="/dashboard/projects/:projectId"
            element={<div>Customer project detail</div>}
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
  vi.mocked(customProjectsApi.listCustomerCustomProjects).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [project],
  })
})

describe('MyProjectsPage', () => {
  it('lists the current user custom projects with quote amount', async () => {
    renderPage()

    expect(await screen.findByText('Hero prop')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /new request/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/new',
    )
    expect(screen.getByText('Quoted')).toBeInTheDocument()
    expect(screen.getByText('USD 175.00')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Hero prop' })).toHaveAttribute(
      'href',
      `/dashboard/projects/${project.id}`,
    )
    expect(customProjectsApi.listCustomerCustomProjects).toHaveBeenCalledWith({
      page: 1,
      page_size: 20,
    })
  })

  it('shows a dash when a project has no quotation yet', async () => {
    vi.mocked(customProjectsApi.listCustomerCustomProjects).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [unquotedProject],
    })
    renderPage()

    expect(await screen.findByText('Unquoted sketch')).toBeInTheDocument()
    expect(screen.getByText('Submitted')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('navigates to the project detail route when a row is activated', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Hero prop')
    await user.click(screen.getByText('Quoted'))

    expect(await screen.findByText('Customer project detail')).toBeInTheDocument()
  })

  it('navigates when the title link is used', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('link', { name: 'Hero prop' }))

    expect(await screen.findByText('Customer project detail')).toBeInTheDocument()
  })

  it('navigates to detail when a row is activated with Enter', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Hero prop')
    const row = screen.getByText('Quoted').closest('tr')
    expect(row).not.toBeNull()
    row?.focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText('Customer project detail')).toBeInTheDocument()
  })

  it('disables previous on the first page and enables next when more pages exist', async () => {
    vi.mocked(customProjectsApi.listCustomerCustomProjects).mockResolvedValue({
      count: 21,
      next: 'http://127.0.0.1:8000/api/custom-projects/?page=2',
      previous: null,
      results: [project],
    })
    renderPage()

    await screen.findByText('Hero prop')
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
  })

  it('shows an empty state when the user has no projects', async () => {
    vi.mocked(customProjectsApi.listCustomerCustomProjects).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })
    renderPage()

    expect(
      await screen.findByText(/you have no custom projects yet/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /submit your first request/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/new',
    )
    expect(screen.queryByLabelText(/project pagination/i)).not.toBeInTheDocument()
  })

  it('recovers from an empty later page by stepping back', async () => {
    vi.mocked(customProjectsApi.listCustomerCustomProjects)
      .mockResolvedValueOnce({
        count: 21,
        next: 'http://127.0.0.1:8000/api/custom-projects/?page=2',
        previous: null,
        results: [project],
      })
      .mockResolvedValueOnce({
        count: 1,
        next: null,
        previous: 'http://127.0.0.1:8000/api/custom-projects/?page=1',
        results: [],
      })
      .mockResolvedValueOnce({
        count: 1,
        next: null,
        previous: null,
        results: [project],
      })

    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Hero prop')
    await user.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => {
      expect(customProjectsApi.listCustomerCustomProjects).toHaveBeenCalledWith({
        page: 1,
        page_size: 20,
      })
    })
    expect(await screen.findByText('Hero prop')).toBeInTheDocument()
  })

  it('shows an unread badge when a project has unread messages', async () => {
    vi.mocked(customProjectsApi.listCustomerCustomProjects).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ ...project, unread_count: 2, has_unread: true }],
    })

    renderPage()

    expect(await screen.findByText('Hero prop')).toBeInTheDocument()
    expect(screen.getByLabelText('2 unread messages')).toHaveTextContent('2')
  })

  it('renders a StatusBadge for completed projects', async () => {
    vi.mocked(customProjectsApi.listCustomerCustomProjects).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ ...project, status: 'completed' as const }],
    })
    renderPage()

    expect(await screen.findByLabelText('Status: Completed')).toBeInTheDocument()
  })

  it('shows an error state and retries the list request', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.listCustomerCustomProjects)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        count: 1,
        next: null,
        previous: null,
        results: [project],
      })

    renderPage()

    expect(
      await screen.findByText(/could not load your projects/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByText('Hero prop')).toBeInTheDocument()
    })
    expect(customProjectsApi.listCustomerCustomProjects).toHaveBeenCalledTimes(2)
  })
})
