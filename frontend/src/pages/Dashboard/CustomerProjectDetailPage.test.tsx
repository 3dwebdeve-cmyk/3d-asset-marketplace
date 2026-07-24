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
import { CustomerProjectDetailPage } from './CustomerProjectDetailPage'

vi.mock('../../api/customProjectsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/customProjectsApi')>(
    '../../api/customProjectsApi',
  )
  return {
    ...actual,
    getCustomerCustomProject: vi.fn(),
    listCustomerProjectMessages: vi.fn(),
    createCustomerProjectMessage: vi.fn(),
    markCustomerProjectMessagesRead: vi.fn(),
  }
})

const projectId = '11111111-1111-1111-1111-111111111111'

const project: CustomerCustomProject = {
  id: projectId,
  title: 'Hero prop',
  description: 'Stylized sci-fi crate with baked lighting.',
  category: 'Props',
  status: 'quoted',
  payment_status: 'unpaid',
  estimated_budget: '150.00',
  currency: 'USD',
  deadline: '2026-08-01',
  assigned_designer: {
    id: '33333333-3333-3333-3333-333333333333',
    full_name: 'Dana Designer',
  },
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
  files: [
    {
      id: '55555555-5555-5555-5555-555555555555',
      file_type: 'reference_image',
      file_name: 'crate-ref.png',
      file_size: 2048,
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    },
  ],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-15T12:00:00Z',
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

function renderPage(initialPath = `/dashboard/projects/${projectId}`) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/dashboard/projects" element={<div>My projects list</div>} />
          <Route
            path="/dashboard/projects/:projectId"
            element={<CustomerProjectDetailPage />}
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
  vi.mocked(customProjectsApi.getCustomerCustomProject).mockResolvedValue(project)
  vi.mocked(customProjectsApi.listCustomerProjectMessages).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  vi.mocked(customProjectsApi.markCustomerProjectMessagesRead).mockResolvedValue({
    project_id: projectId,
    last_read_at: '2026-01-10T12:00:00Z',
    unread_count: 0,
  })
})

describe('CustomerProjectDetailPage', () => {
  it('loads project detail fields, quotation, and reference files', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Hero prop' })).toBeInTheDocument()
    expect(screen.getByText('Quoted')).toBeInTheDocument()
    expect(screen.getByText('Unpaid')).toBeInTheDocument()
    expect(screen.getByText('Props')).toBeInTheDocument()
    expect(screen.getByText('USD 150.00')).toBeInTheDocument()
    expect(
      screen.getByText('Stylized sci-fi crate with baked lighting.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Dana Designer')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Quotation' })).toBeInTheDocument()
    expect(screen.getByText('USD 220.00')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Includes two revision rounds.')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Reference files' })).toBeInTheDocument()
    expect(screen.getByText('crate-ref.png')).toBeInTheDocument()
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument()
    expect(screen.getByText('Reference image')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /back to my projects/i })).toHaveAttribute(
      'href',
      '/dashboard/projects',
    )
    expect(customProjectsApi.getCustomerCustomProject).toHaveBeenCalledWith(projectId)
    expect(await screen.findByRole('heading', { name: 'Messages' })).toBeInTheDocument()
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument()
    expect(customProjectsApi.listCustomerProjectMessages).toHaveBeenCalledWith(projectId, {
      page: 1,
      page_size: 100,
    })
  })

  it('renders existing project messages on the detail page', async () => {
    vi.mocked(customProjectsApi.listCustomerProjectMessages).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: '99999999-9999-9999-9999-999999999999',
          project_id: projectId,
          body: 'Detail page thread message',
          sender: {
            id: '88888888-8888-8888-8888-888888888888',
            full_name: 'Studio Admin',
          },
          attachments: [],
          created_at: '2026-01-10T10:00:00Z',
          updated_at: '2026-01-10T10:00:00Z',
        },
      ],
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Hero prop' })).toBeInTheDocument()
    expect(await screen.findByText('Detail page thread message')).toBeInTheDocument()
    expect(screen.getByText('Studio')).toBeInTheDocument()
  })

  it('does not fetch messages when the project detail request fails', async () => {
    vi.mocked(customProjectsApi.getCustomerCustomProject).mockRejectedValue(
      axiosStatusError(404, 'Not found.'),
    )
    renderPage()

    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    expect(customProjectsApi.listCustomerProjectMessages).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Messages' })).not.toBeInTheDocument()
  })

  it('shows loading state while the project request is in flight', async () => {
    let resolveProject: ((value: CustomerCustomProject) => void) | undefined
    vi.mocked(customProjectsApi.getCustomerCustomProject).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProject = resolve
        }),
    )

    renderPage()

    expect(await screen.findByText(/loading project/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Project details' })).toBeInTheDocument()

    resolveProject?.(project)

    expect(await screen.findByRole('heading', { name: 'Hero prop' })).toBeInTheDocument()
  })

  it('shows dashes for missing category, budget, and deadline', async () => {
    vi.mocked(customProjectsApi.getCustomerCustomProject).mockResolvedValue({
      ...project,
      category: '',
      estimated_budget: null,
      deadline: null,
      assigned_designer: null,
      quotation: null,
      files: [],
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Hero prop' })).toBeInTheDocument()
    expect(screen.getByText('Category:').parentElement).toHaveTextContent('—')
    expect(screen.getByText('Budget:').parentElement).toHaveTextContent('—')
    expect(screen.getByText('Deadline:').parentElement).toHaveTextContent('—')
    expect(screen.queryByText(/assigned designer/i)).not.toBeInTheDocument()
  })

  it('shows an empty quotation and files state when none exist', async () => {
    vi.mocked(customProjectsApi.getCustomerCustomProject).mockResolvedValue({
      ...project,
      quotation: null,
      files: [],
      assigned_designer: null,
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Hero prop' })).toBeInTheDocument()
    expect(screen.getByText(/no quotation yet/i)).toBeInTheDocument()
    expect(screen.getByText(/no reference files uploaded yet/i)).toBeInTheDocument()
  })

  it('renders quotation with blank notes and rejected status', async () => {
    vi.mocked(customProjectsApi.getCustomerCustomProject).mockResolvedValue({
      ...project,
      quotation: {
        ...project.quotation!,
        notes: '   ',
        status: 'rejected',
        estimated_delivery: null,
      },
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Quotation' })).toBeInTheDocument()
    expect(screen.getByText('Rejected')).toBeInTheDocument()
    expect(screen.getByText('Notes:').parentElement).toHaveTextContent('—')
    expect(screen.getByText('Estimated delivery:').parentElement).toHaveTextContent('—')
  })

  it('lists multiple reference file types', async () => {
    vi.mocked(customProjectsApi.getCustomerCustomProject).mockResolvedValue({
      ...project,
      files: [
        {
          id: '55555555-5555-5555-5555-555555555555',
          file_type: 'reference_image',
          file_name: 'crate-ref.png',
          file_size: 512,
          created_at: '2026-01-02T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
        {
          id: '66666666-6666-6666-6666-666666666666',
          file_type: 'cad_drawing',
          file_name: 'crate.dwg',
          file_size: 1048576,
          created_at: '2026-01-03T00:00:00Z',
          updated_at: '2026-01-03T00:00:00Z',
        },
        {
          id: '77777777-7777-7777-7777-777777777777',
          file_type: 'sketch',
          file_name: 'idea.pdf',
          file_size: 4096,
          created_at: '2026-01-04T00:00:00Z',
          updated_at: '2026-01-04T00:00:00Z',
        },
        {
          id: '88888888-8888-8888-8888-888888888888',
          file_type: 'other',
          file_name: 'notes.txt',
          file_size: 128,
          created_at: '2026-01-05T00:00:00Z',
          updated_at: '2026-01-05T00:00:00Z',
        },
      ],
    })
    renderPage()

    expect(await screen.findByText('crate-ref.png')).toBeInTheDocument()
    expect(screen.getByText('crate.dwg')).toBeInTheDocument()
    expect(screen.getByText('idea.pdf')).toBeInTheDocument()
    expect(screen.getByText('notes.txt')).toBeInTheDocument()
    expect(screen.getByText('Reference image')).toBeInTheDocument()
    expect(screen.getByText('CAD drawing')).toBeInTheDocument()
    expect(screen.getByText('Sketch')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
    expect(screen.getByText(/1\.0 MB/)).toBeInTheDocument()
  })

  it('shows a not-found state for 404 responses without retry', async () => {
    vi.mocked(customProjectsApi.getCustomerCustomProject).mockRejectedValue(
      axiosStatusError(404, 'Not found.'),
    )
    renderPage()

    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    expect(
      screen.getByText(/could not be found or you do not have access/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('shows a not-found state for 403 responses without retry', async () => {
    vi.mocked(customProjectsApi.getCustomerCustomProject).mockRejectedValue(
      axiosStatusError(403, 'Forbidden.'),
    )
    renderPage()

    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/forbidden/i)).not.toBeInTheDocument()
  })

  it('shows an API detail message for recoverable failures', async () => {
    vi.mocked(customProjectsApi.getCustomerCustomProject).mockRejectedValue(
      axiosStatusError(500, 'Temporary service interruption.'),
    )
    renderPage()

    expect(await screen.findByText(/could not load project/i)).toBeInTheDocument()
    expect(screen.getByText('Temporary service interruption.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('shows an error state and retries on recoverable failures', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.getCustomerCustomProject)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(project)

    renderPage()

    expect(await screen.findByText(/could not load project/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Hero prop' })).toBeInTheDocument()
    })
    expect(customProjectsApi.getCustomerCustomProject).toHaveBeenCalledTimes(2)
  })

  it('does not call the detail API when projectId is missing', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={['/dashboard/projects/']}>
          <Routes>
            <Route path="/dashboard/projects/" element={<CustomerProjectDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText(/project not found/i)).toBeInTheDocument()
    expect(customProjectsApi.getCustomerCustomProject).not.toHaveBeenCalled()
  })

  it('navigates back to My projects from the detail page', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { name: 'Hero prop' })
    await user.click(screen.getByRole('link', { name: /back to my projects/i }))

    expect(await screen.findByText('My projects list')).toBeInTheDocument()
  })
})
