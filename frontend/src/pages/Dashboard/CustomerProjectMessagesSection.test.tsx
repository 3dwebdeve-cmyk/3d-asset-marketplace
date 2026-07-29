import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as customProjectsApi from '../../api/customProjectsApi'
import {
  createTestQueryClient,
  resetAuthStore,
  resetToastStore,
  testUser,
} from '../../test/test-utils'
import { useAuthStore } from '../../store/authStore'
import type { ApiErrorResponse } from '../../types/auth'
import type { ProjectMessage } from '../../types/customProject'
import { CustomerProjectMessagesSection } from './CustomerProjectMessagesSection'

vi.mock('../../api/customProjectsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/customProjectsApi')>(
    '../../api/customProjectsApi',
  )
  return {
    ...actual,
    listCustomerProjectMessages: vi.fn(),
    createCustomerProjectMessage: vi.fn(),
    markCustomerProjectMessagesRead: vi.fn(),
    downloadCustomerProjectMessageAttachment: vi.fn(),
  }
})

const projectId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const studioSenderId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const customerMessage: ProjectMessage = {
  id: '11111111-1111-1111-1111-111111111111',
  project_id: projectId,
  body: 'Can we keep the crate matte?',
  sender: {
    id: testUser.id,
    full_name: testUser.full_name,
  },
  attachments: [],
  created_at: '2026-01-10T10:00:00Z',
  updated_at: '2026-01-10T10:00:00Z',
}

const studioMessage: ProjectMessage = {
  id: '22222222-2222-2222-2222-222222222222',
  project_id: projectId,
  body: 'Yes — matte finish works well.',
  sender: {
    id: studioSenderId,
    full_name: 'Studio Admin',
  },
  attachments: [],
  created_at: '2026-01-10T11:00:00Z',
  updated_at: '2026-01-10T11:00:00Z',
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

function renderSection(id = projectId) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CustomerProjectMessagesSection projectId={id} />
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
    user: testUser,
    isAuthenticated: true,
  })
  vi.mocked(customProjectsApi.listCustomerProjectMessages).mockResolvedValue({
    count: 2,
    next: null,
    previous: null,
    results: [customerMessage, studioMessage],
  })
  vi.mocked(customProjectsApi.markCustomerProjectMessagesRead).mockResolvedValue({
    project_id: projectId,
    last_read_at: '2026-01-10T12:00:00Z',
    unread_count: 0,
  })
})

describe('CustomerProjectMessagesSection', () => {
  it('renders the chronological thread with You / Studio labels', async () => {
    renderSection()

    expect(await screen.findByText('Can we keep the crate matte?')).toBeInTheDocument()
    expect(screen.getByText('Yes — matte finish works well.')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Studio')).toBeInTheDocument()

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Can we keep the crate matte?')
    expect(items[1]).toHaveTextContent('Yes — matte finish works well.')
    expect(customProjectsApi.listCustomerProjectMessages).toHaveBeenCalledWith(projectId, {
      page: 1,
      page_size: 100,
    })
  })

  it('marks the thread as read after a successful messages load', async () => {
    renderSection()

    await screen.findByText('Can we keep the crate matte?')
    await waitFor(() => {
      expect(customProjectsApi.markCustomerProjectMessagesRead).toHaveBeenCalledWith(
        projectId,
      )
    })
  })

  it('does not mark read when messages fail to load', async () => {
    vi.mocked(customProjectsApi.listCustomerProjectMessages).mockRejectedValue(
      axiosStatusError(500, 'Server error'),
    )
    renderSection()

    expect(await screen.findByText(/could not load messages/i)).toBeInTheDocument()
    expect(customProjectsApi.markCustomerProjectMessagesRead).not.toHaveBeenCalled()
  })

  it('keeps the thread visible when mark-read fails (no crash)', async () => {
    vi.mocked(customProjectsApi.markCustomerProjectMessagesRead).mockRejectedValue(
      new Error('mark-read unavailable'),
    )
    renderSection()

    expect(await screen.findByText('Can we keep the crate matte?')).toBeInTheDocument()
    expect(screen.getByText('Yes — matte finish works well.')).toBeInTheDocument()
    expect(screen.getByLabelText(/write a message/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(customProjectsApi.markCustomerProjectMessagesRead).toHaveBeenCalled()
    })
  })

  it('does not storm mark-read or list calls after a successful open', async () => {
    renderSection()
    await screen.findByText('Can we keep the crate matte?')

    await waitFor(() => {
      expect(customProjectsApi.markCustomerProjectMessagesRead).toHaveBeenCalledTimes(1)
    })
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(customProjectsApi.markCustomerProjectMessagesRead).toHaveBeenCalledTimes(1)
    // fetchLatestProjectMessages may request page 1 only when count <= page size.
    expect(vi.mocked(customProjectsApi.listCustomerProjectMessages).mock.calls.length).toBeLessThan(5)
  })

  it('labels every sender as Studio when the current user is unknown', async () => {
    useAuthStore.setState({ user: null })
    renderSection()

    expect(await screen.findByText('Can we keep the crate matte?')).toBeInTheDocument()
    expect(screen.getAllByText('Studio')).toHaveLength(2)
    expect(screen.queryByText('You')).not.toBeInTheDocument()
  })

  it('shows the latest messages when the thread exceeds one page', async () => {
    const pageOne = Array.from({ length: 100 }, (_, index) => ({
      ...customerMessage,
      id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
      body: `old-${index + 1}`,
    }))
    const newest: ProjectMessage = {
      ...studioMessage,
      id: '99999999-9999-9999-9999-999999999999',
      body: 'latest studio reply',
    }
    vi.mocked(customProjectsApi.listCustomerProjectMessages).mockImplementation(
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

    expect(await screen.findByText('latest studio reply')).toBeInTheDocument()
    expect(screen.getByText(/showing the latest 100 messages/i)).toBeInTheDocument()
    expect(screen.queryByText('old-1')).not.toBeInTheDocument()
  })

  it('shows a dash for invalid message timestamps', async () => {
    vi.mocked(customProjectsApi.listCustomerProjectMessages).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ ...customerMessage, created_at: 'not-a-date' }],
    })
    renderSection()

    expect(await screen.findByText('Can we keep the crate matte?')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows loading state while the thread request is in flight', async () => {
    let resolveList: ((value: Awaited<
      ReturnType<typeof customProjectsApi.listCustomerProjectMessages>
    >) => void) | undefined
    vi.mocked(customProjectsApi.listCustomerProjectMessages).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve
        }),
    )

    renderSection()

    expect(await screen.findByText(/loading messages/i)).toBeInTheDocument()
    resolveList?.({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })
    expect(await screen.findByText(/no messages yet/i)).toBeInTheDocument()
  })

  it('shows an empty state when there are no messages and keeps the composer', async () => {
    vi.mocked(customProjectsApi.listCustomerProjectMessages).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })
    renderSection()

    expect(await screen.findByText(/no messages yet/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/write a message/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled()
  })

  it('shows an error state and retries when the thread fails to load', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.listCustomerProjectMessages)
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
      expect(screen.getByText('Can we keep the crate matte?')).toBeInTheDocument()
    })
    expect(customProjectsApi.listCustomerProjectMessages).toHaveBeenCalledTimes(2)
  })

  it('disables send for blank input and does not call create', async () => {
    renderSection()
    await screen.findByText('Can we keep the crate matte?')

    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled()
    expect(customProjectsApi.createCustomerProjectMessage).not.toHaveBeenCalled()
  })

  it('trims whitespace before sending a message', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.createCustomerProjectMessage).mockResolvedValue({
      ...customerMessage,
      id: '33333333-3333-3333-3333-333333333333',
      body: 'Trimmed note',
    })
    vi.mocked(customProjectsApi.listCustomerProjectMessages)
      .mockResolvedValueOnce({
        count: 2,
        next: null,
        previous: null,
        results: [customerMessage, studioMessage],
      })
      .mockResolvedValueOnce({
        count: 3,
        next: null,
        previous: null,
        results: [
          customerMessage,
          studioMessage,
          {
            ...customerMessage,
            id: '33333333-3333-3333-3333-333333333333',
            body: 'Trimmed note',
          },
        ],
      })

    renderSection()
    await screen.findByText('Can we keep the crate matte?')

    await user.type(screen.getByLabelText(/write a message/i), '  Trimmed note  ')
    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => {
      expect(customProjectsApi.createCustomerProjectMessage).toHaveBeenCalledWith(projectId, {
        body: 'Trimmed note',
      })
    })
  })

  it('sends a message, disables while submitting, and refreshes the thread', async () => {
    const user = userEvent.setup()
    let resolveCreate: ((value: ProjectMessage) => void) | undefined
    const created: ProjectMessage = {
      id: '33333333-3333-3333-3333-333333333333',
      project_id: projectId,
      body: 'Adding reference notes.',
      sender: {
        id: testUser.id,
        full_name: testUser.full_name,
      },
      attachments: [],
      created_at: '2026-01-10T12:00:00Z',
      updated_at: '2026-01-10T12:00:00Z',
    }

    vi.mocked(customProjectsApi.createCustomerProjectMessage).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        }),
    )
    vi.mocked(customProjectsApi.listCustomerProjectMessages)
      .mockResolvedValueOnce({
        count: 2,
        next: null,
        previous: null,
        results: [customerMessage, studioMessage],
      })
      .mockResolvedValueOnce({
        count: 3,
        next: null,
        previous: null,
        results: [customerMessage, studioMessage, created],
      })

    renderSection()
    await screen.findByText('Can we keep the crate matte?')

    await user.type(
      screen.getByLabelText(/write a message/i),
      'Adding reference notes.',
    )
    await user.click(screen.getByRole('button', { name: /send message/i }))

    expect(screen.getByRole('button', { name: /please wait/i })).toBeDisabled()
    expect(screen.getByLabelText(/write a message/i)).toBeDisabled()
    expect(customProjectsApi.createCustomerProjectMessage).toHaveBeenCalledWith(projectId, {
      body: 'Adding reference notes.',
    })

    resolveCreate?.(created)

    await waitFor(() => {
      expect(screen.getByText('Adding reference notes.')).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/write a message/i)).toHaveValue('')
    expect(customProjectsApi.listCustomerProjectMessages).toHaveBeenCalledTimes(2)
  })

  it('shows an error when send fails and keeps the draft', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.createCustomerProjectMessage).mockRejectedValue(
      new Error('network'),
    )

    renderSection()
    await screen.findByText('Can we keep the crate matte?')

    await user.type(screen.getByLabelText(/write a message/i), 'This should fail.')
    await user.click(screen.getByRole('button', { name: /send message/i }))

    expect(
      await screen.findByText(/could not send your message/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/write a message/i)).toHaveValue('This should fail.')
    expect(screen.getByRole('button', { name: /send message/i })).toBeEnabled()
  })

  it('surfaces API detail text when send fails with a server message', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.createCustomerProjectMessage).mockRejectedValue(
      axiosStatusError(400, 'Message body cannot be empty.'),
    )

    renderSection()
    await screen.findByText('Can we keep the crate matte?')

    await user.type(screen.getByLabelText(/write a message/i), 'Rejected by API')
    await user.click(screen.getByRole('button', { name: /send message/i }))

    expect(await screen.findByText('Message body cannot be empty.')).toBeInTheDocument()
  })

  it('renders message body as text only (no HTML execution)', async () => {
    vi.mocked(customProjectsApi.listCustomerProjectMessages).mockResolvedValue({
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

  it('preserves multiline message body text', async () => {
    vi.mocked(customProjectsApi.listCustomerProjectMessages).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          ...customerMessage,
          body: 'Line one\nLine two',
        },
      ],
    })
    renderSection()

    const body = await screen.findByText(/line one/i)
    expect(body).toHaveTextContent('Line one')
    expect(body).toHaveTextContent('Line two')
    expect(body.textContent).toContain('\n')
  })

  it('shows attachments in the thread and downloads via API', async () => {
    const user = userEvent.setup()
    const attachmentMessage: ProjectMessage = {
      ...customerMessage,
      body: 'Attached sketch',
      attachments: [
        {
          id: '55555555-5555-5555-5555-555555555555',
          file_name: 'sketch.png',
          file_size: 2048,
          download_url: `/api/custom-projects/${projectId}/messages/${customerMessage.id}/attachments/55555555-5555-5555-5555-555555555555/download/`,
          created_at: '2026-01-10T10:00:00Z',
          updated_at: '2026-01-10T10:00:00Z',
        },
      ],
    }
    vi.mocked(customProjectsApi.listCustomerProjectMessages).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [attachmentMessage],
    })
    vi.mocked(customProjectsApi.downloadCustomerProjectMessageAttachment).mockResolvedValue()

    renderSection()

    expect(await screen.findByText(/sketch\.png/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /download/i }))

    expect(customProjectsApi.downloadCustomerProjectMessageAttachment).toHaveBeenCalledWith(
      projectId,
      attachmentMessage.id,
      '55555555-5555-5555-5555-555555555555',
      'sketch.png',
    )
  })

  it('sends a message with an attached file', async () => {
    const user = userEvent.setup()
    const file = new File(['png-bytes'], 'brief.png', { type: 'image/png' })
    vi.mocked(customProjectsApi.createCustomerProjectMessage).mockResolvedValue({
      ...customerMessage,
      id: '66666666-6666-6666-6666-666666666666',
      body: 'With file',
      attachments: [
        {
          id: '77777777-7777-7777-7777-777777777777',
          file_name: 'brief.png',
          file_size: file.size,
          download_url: 'https://example.test/download',
          created_at: '2026-01-10T12:00:00Z',
          updated_at: '2026-01-10T12:00:00Z',
        },
      ],
    })
    vi.mocked(customProjectsApi.listCustomerProjectMessages)
      .mockResolvedValueOnce({
        count: 0,
        next: null,
        previous: null,
        results: [],
      })
      .mockResolvedValueOnce({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            ...customerMessage,
            id: '66666666-6666-6666-6666-666666666666',
            body: 'With file',
          },
        ],
      })

    renderSection()
    await screen.findByText(/no messages yet/i)

    await user.type(screen.getByLabelText(/write a message/i), 'With file')
    await user.upload(screen.getByLabelText(/attachment \(optional\)/i), file)
    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => {
      expect(customProjectsApi.createCustomerProjectMessage).toHaveBeenCalledWith(projectId, {
        body: 'With file',
        file,
      })
    })
  })

  it('rejects invalid attachment types before calling create', async () => {
    const file = new File(['MZ'], 'malware.exe', { type: 'application/octet-stream' })
    renderSection()
    await screen.findByText('Can we keep the crate matte?')

    fireEvent.change(screen.getByLabelText(/attachment \(optional\)/i), {
      target: { files: [file] },
    })

    expect(await screen.findByText(/invalid file type/i)).toBeInTheDocument()
    expect(customProjectsApi.createCustomerProjectMessage).not.toHaveBeenCalled()
  })

  it('RISK A: missing attachments field no longer crashes the thread', async () => {
    const broken = {
      ...customerMessage,
      attachments: undefined,
    } as unknown as ProjectMessage
    vi.mocked(customProjectsApi.listCustomerProjectMessages).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [broken],
    })

    renderSection()

    expect(await screen.findByText('Can we keep the crate matte?')).toBeInTheDocument()
  })

  it('RISK B/E: attachment-only and multi-attachment messages render without crash', async () => {
    const attachmentOnly: ProjectMessage = {
      ...customerMessage,
      id: 'aaaaaaaa-1111-1111-1111-111111111111',
      body: '',
      attachments: [
        {
          id: 'aaaaaaaa-2222-2222-2222-222222222222',
          file_name: 'solo.png',
          file_size: 128,
          download_url: 'https://example.test/solo',
          created_at: '2026-01-10T10:00:00Z',
          updated_at: '2026-01-10T10:00:00Z',
        },
      ],
    }
    const multi: ProjectMessage = {
      ...studioMessage,
      id: 'bbbbbbbb-1111-1111-1111-111111111111',
      body: 'two files',
      attachments: [
        {
          id: 'bbbbbbbb-2222-2222-2222-222222222222',
          file_name: 'a.pdf',
          file_size: 256,
          download_url: 'https://example.test/a',
          created_at: '2026-01-10T11:00:00Z',
          updated_at: '2026-01-10T11:00:00Z',
        },
        {
          id: 'bbbbbbbb-3333-3333-3333-333333333333',
          file_name: 'b.zip',
          file_size: 512,
          download_url: 'https://example.test/b',
          created_at: '2026-01-10T11:00:00Z',
          updated_at: '2026-01-10T11:00:00Z',
        },
      ],
    }
    vi.mocked(customProjectsApi.listCustomerProjectMessages).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [attachmentOnly, multi],
    })

    renderSection()

    expect(await screen.findByText(/solo\.png/)).toBeInTheDocument()
    expect(screen.getByText(/a\.pdf/)).toBeInTheDocument()
    expect(screen.getByText(/b\.zip/)).toBeInTheDocument()
    expect(screen.getByText('two files')).toBeInTheDocument()
  })
})
