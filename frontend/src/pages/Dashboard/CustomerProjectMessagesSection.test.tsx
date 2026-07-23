import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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

  it('labels every sender as Studio when the current user is unknown', async () => {
    useAuthStore.setState({ user: null })
    renderSection()

    expect(await screen.findByText('Can we keep the crate matte?')).toBeInTheDocument()
    expect(screen.getAllByText('Studio')).toHaveLength(2)
    expect(screen.queryByText('You')).not.toBeInTheDocument()
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
})
