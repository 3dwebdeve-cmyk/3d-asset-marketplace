import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as customProjectsApi from '../../api/customProjectsApi'
import {
  createTestQueryClient,
  resetAuthStore,
  resetToastStore,
} from '../../test/test-utils'
import { useAuthStore } from '../../store/authStore'
import type { AuthUser } from '../../types/auth'
import type { ProjectMessage } from '../../types/customProject'
import { AdminProjectMessagesSection } from './AdminProjectMessagesSection'

vi.mock('../../api/customProjectsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/customProjectsApi')>(
    '../../api/customProjectsApi',
  )
  return {
    ...actual,
    listAdminProjectMessages: vi.fn(),
    createAdminProjectMessage: vi.fn(),
    markAdminProjectMessagesRead: vi.fn(),
    downloadAdminProjectMessageAttachment: vi.fn(),
  }
})

const projectId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const customerSenderId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const otherAdminId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const adminUser: AuthUser = {
  id: '11111111-1111-1111-1111-111111111111',
  full_name: 'Admin Designer',
  email: 'admin@example.com',
  phone: '',
  country: 'India',
  avatar: '',
  role: 'Administrator',
  email_verified: true,
  created_at: '2024-01-01T00:00:00Z',
}

const adminMessage: ProjectMessage = {
  id: '11111111-1111-1111-1111-111111111111',
  project_id: projectId,
  body: 'Please share reference photos.',
  sender: {
    id: adminUser.id,
    full_name: adminUser.full_name,
  },
  attachments: [],
  created_at: '2026-01-10T10:00:00Z',
  updated_at: '2026-01-10T10:00:00Z',
}

const customerMessage: ProjectMessage = {
  id: '22222222-2222-2222-2222-222222222222',
  project_id: projectId,
  body: 'Uploading them now.',
  sender: {
    id: customerSenderId,
    full_name: 'Ada Customer',
  },
  attachments: [],
  created_at: '2026-01-10T11:00:00Z',
  updated_at: '2026-01-10T11:00:00Z',
}

const otherAdminMessage: ProjectMessage = {
  id: '33333333-3333-3333-3333-333333333333',
  project_id: projectId,
  body: 'I can take the revisions.',
  sender: {
    id: otherAdminId,
    full_name: 'Second Admin',
  },
  attachments: [],
  created_at: '2026-01-10T12:00:00Z',
  updated_at: '2026-01-10T12:00:00Z',
}

function renderSection(id = projectId, customerId = customerSenderId) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AdminProjectMessagesSection projectId={id} customerId={customerId} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  useAuthStore.setState({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: adminUser,
    isAuthenticated: true,
  })
  vi.mocked(customProjectsApi.listAdminProjectMessages).mockResolvedValue({
    count: 2,
    next: null,
    previous: null,
    results: [adminMessage, customerMessage],
  })
  vi.mocked(customProjectsApi.markAdminProjectMessagesRead).mockResolvedValue({
    project_id: projectId,
    last_read_at: '2026-01-10T12:00:00Z',
    unread_count: 0,
  })
})

describe('AdminProjectMessagesSection', () => {
  it('renders the chronological thread with You / Customer labels', async () => {
    renderSection()

    expect(await screen.findByText('Please share reference photos.')).toBeInTheDocument()
    expect(screen.getByText('Uploading them now.')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Customer')).toBeInTheDocument()
    expect(
      screen.getByText(/shared with the customer\. separate from internal admin notes/i),
    ).toBeInTheDocument()

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Please share reference photos.')
    expect(items[1]).toHaveTextContent('Uploading them now.')
    expect(customProjectsApi.listAdminProjectMessages).toHaveBeenCalledWith(projectId, {
      page: 1,
      page_size: 100,
    })
  })

  it('marks the thread as read after a successful messages load', async () => {
    renderSection()

    await screen.findByText('Please share reference photos.')
    await waitFor(() => {
      expect(customProjectsApi.markAdminProjectMessagesRead).toHaveBeenCalledWith(projectId)
    })
  })

  it('keeps the thread visible when mark-read fails (no crash)', async () => {
    vi.mocked(customProjectsApi.markAdminProjectMessagesRead).mockRejectedValue(
      new Error('mark-read unavailable'),
    )
    renderSection()

    expect(await screen.findByText('Please share reference photos.')).toBeInTheDocument()
    expect(screen.getByText('Uploading them now.')).toBeInTheDocument()
    expect(screen.getByLabelText(/reply to customer/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(customProjectsApi.markAdminProjectMessagesRead).toHaveBeenCalled()
    })
  })

  it('does not storm mark-read or list calls after a successful open', async () => {
    renderSection()
    await screen.findByText('Please share reference photos.')

    await waitFor(() => {
      expect(customProjectsApi.markAdminProjectMessagesRead).toHaveBeenCalledTimes(1)
    })
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(customProjectsApi.markAdminProjectMessagesRead).toHaveBeenCalledTimes(1)
    expect(customProjectsApi.listAdminProjectMessages.mock.calls.length).toBeLessThan(5)
  })

  it('labels another admin by name instead of Customer', async () => {
    vi.mocked(customProjectsApi.listAdminProjectMessages).mockResolvedValue({
      count: 3,
      next: null,
      previous: null,
      results: [adminMessage, customerMessage, otherAdminMessage],
    })
    renderSection()

    expect(await screen.findByText('I can take the revisions.')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Customer')).toBeInTheDocument()
    expect(screen.getByText('Second Admin')).toBeInTheDocument()
  })

  it('shows the latest messages when the thread exceeds one page', async () => {
    const pageOne = Array.from({ length: 100 }, (_, index) => ({
      ...customerMessage,
      id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
      body: `old-${index + 1}`,
    }))
    const newest: ProjectMessage = {
      ...customerMessage,
      id: '99999999-9999-9999-9999-999999999999',
      body: 'brand-new reply',
    }
    vi.mocked(customProjectsApi.listAdminProjectMessages).mockImplementation(
      async (_id, params = {}) => {
        const page = params.page ?? 1
        if (page === 1) {
          return {
            count: 101,
            next: 'next-page',
            previous: null,
            results: pageOne,
          }
        }
        return {
          count: 101,
          next: null,
          previous: 'prev-page',
          results: [newest],
        }
      },
    )

    renderSection()

    expect(await screen.findByText('brand-new reply')).toBeInTheDocument()
    expect(screen.getByText(/showing the latest 100 messages/i)).toBeInTheDocument()
    expect(screen.queryByText('old-1')).not.toBeInTheDocument()
    expect(customProjectsApi.listAdminProjectMessages).toHaveBeenCalledWith(projectId, {
      page: 2,
      page_size: 100,
    })
  })

  it('shows an empty state when there are no messages and keeps the composer', async () => {
    vi.mocked(customProjectsApi.listAdminProjectMessages).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })
    renderSection()

    expect(await screen.findByText(/no messages yet/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/reply to customer/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reply/i })).toBeDisabled()
  })

  it('shows an error state and retries when the thread fails to load', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.listAdminProjectMessages)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        count: 1,
        next: null,
        previous: null,
        results: [customerMessage],
      })

    renderSection()

    expect(await screen.findByText(/could not load messages/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByText('Uploading them now.')).toBeInTheDocument()
    })
    expect(customProjectsApi.listAdminProjectMessages).toHaveBeenCalledTimes(2)
  })

  it('sends a reply, disables while submitting, and refreshes the thread', async () => {
    const user = userEvent.setup()
    let resolveCreate: ((value: ProjectMessage) => void) | undefined
    const created: ProjectMessage = {
      id: '33333333-3333-3333-3333-333333333333',
      project_id: projectId,
      body: 'Thanks — we will review today.',
      sender: {
        id: adminUser.id,
        full_name: adminUser.full_name,
      },
      attachments: [],
      created_at: '2026-01-10T12:00:00Z',
      updated_at: '2026-01-10T12:00:00Z',
    }

    vi.mocked(customProjectsApi.createAdminProjectMessage).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        }),
    )
    vi.mocked(customProjectsApi.listAdminProjectMessages)
      .mockResolvedValueOnce({
        count: 2,
        next: null,
        previous: null,
        results: [adminMessage, customerMessage],
      })
      .mockResolvedValueOnce({
        count: 3,
        next: null,
        previous: null,
        results: [adminMessage, customerMessage, created],
      })

    renderSection()
    await screen.findByText('Please share reference photos.')

    await user.type(
      screen.getByLabelText(/reply to customer/i),
      'Thanks — we will review today.',
    )
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    expect(screen.getByRole('button', { name: /please wait/i })).toBeDisabled()
    expect(screen.getByLabelText(/reply to customer/i)).toBeDisabled()
    expect(customProjectsApi.createAdminProjectMessage).toHaveBeenCalledWith(projectId, {
      body: 'Thanks — we will review today.',
    })

    resolveCreate?.(created)

    await waitFor(() => {
      expect(screen.getByText('Thanks — we will review today.')).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/reply to customer/i)).toHaveValue('')
    expect(customProjectsApi.listAdminProjectMessages).toHaveBeenCalledTimes(2)
  })

  it('shows an error when reply fails and keeps the draft', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.createAdminProjectMessage).mockRejectedValue(
      new Error('network'),
    )

    renderSection()
    await screen.findByText('Please share reference photos.')

    await user.type(screen.getByLabelText(/reply to customer/i), 'This should fail.')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    expect(await screen.findByText(/could not send your reply/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/reply to customer/i)).toHaveValue('This should fail.')
    expect(screen.getByRole('button', { name: /send reply/i })).toBeEnabled()
  })

  it('renders message body as text only (no HTML execution)', async () => {
    vi.mocked(customProjectsApi.listAdminProjectMessages).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          ...customerMessage,
          body: '<img src=x onerror=alert(1)> script attempt',
        },
      ],
    })
    renderSection()

    expect(
      await screen.findByText('<img src=x onerror=alert(1)> script attempt'),
    ).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows attachments in the thread and downloads via API', async () => {
    const user = userEvent.setup()
    const withAttachment: ProjectMessage = {
      ...customerMessage,
      attachments: [
        {
          id: '55555555-5555-5555-5555-555555555555',
          file_name: 'refs.zip',
          file_size: 4096,
          download_url: `/api/admin/custom-projects/${projectId}/messages/${customerMessage.id}/attachments/55555555-5555-5555-5555-555555555555/download/`,
          created_at: '2026-01-10T11:00:00Z',
          updated_at: '2026-01-10T11:00:00Z',
        },
      ],
    }
    vi.mocked(customProjectsApi.listAdminProjectMessages).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [withAttachment],
    })
    vi.mocked(customProjectsApi.downloadAdminProjectMessageAttachment).mockResolvedValue()

    renderSection()

    expect(await screen.findByText(/refs\.zip/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /download/i }))

    expect(customProjectsApi.downloadAdminProjectMessageAttachment).toHaveBeenCalledWith(
      projectId,
      withAttachment.id,
      '55555555-5555-5555-5555-555555555555',
      'refs.zip',
    )
  })
})
