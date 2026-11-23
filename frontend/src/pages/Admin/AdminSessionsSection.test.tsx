import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { endAdminSession, getAdminSessions, signOutOtherAdminSessions } from '../../api/authApi'
import { toast } from '../../lib/toast'
import { createTestQueryClient } from '../../test/test-utils'
import type { AdminSession } from '../../types/auth'
import { AdminSessionsSection } from './AdminSessionsSection'

vi.mock('../../api/authApi', () => ({
  getAdminSessions: vi.fn(),
  endAdminSession: vi.fn(),
  signOutOtherAdminSessions: vi.fn(),
}))
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const thisBrowser: AdminSession = {
  id: 'session-this',
  user_agent: CHROME,
  ip_address: '203.0.113.10',
  created_at: '2026-11-23T08:00:00Z',
  last_used_at: '2026-11-23T09:30:00Z',
  current: true,
}
const edge: AdminSession = {
  id: 'session-edge',
  user_agent: `${CHROME} Edg/131.0.0.0`,
  ip_address: '198.51.100.7',
  created_at: '2026-11-22T18:00:00Z',
  last_used_at: '2026-11-22T19:00:00Z',
  current: false,
}

function setup() {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AdminSessionsSection />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getAdminSessions).mockResolvedValue([thisBrowser, edge])
  vi.mocked(endAdminSession).mockResolvedValue(undefined)
  vi.mocked(signOutOtherAdminSessions).mockResolvedValue(1)
})

describe('AdminSessionsSection', () => {
  it('lists the signed-in browsers and marks this one', async () => {
    setup()

    const thisRow = (await screen.findByText('This browser')).closest('tr')!
    expect(within(thisRow).getByText('Chrome on Windows')).toBeInTheDocument()
    expect(within(thisRow).getByText('203.0.113.10')).toBeInTheDocument()
    expect(within(thisRow).queryByRole('button')).not.toBeInTheDocument()
    const edgeRow = screen.getByText('Edge on Windows').closest('tr')!
    expect(within(edgeRow).getByText('198.51.100.7')).toBeInTheDocument()
  })

  it('signs out another browser and reloads the list', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole('button', { name: 'Sign out Edge on Windows' }))

    await waitFor(() => expect(endAdminSession).toHaveBeenCalledWith('session-edge'))
    expect(toast.success).toHaveBeenCalledWith('That browser is signed out.')
    await waitFor(() => expect(getAdminSessions).toHaveBeenCalledTimes(2))
  })

  it('signs out every other browser', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(await screen.findByRole('button', { name: 'Sign out all other browsers' }))

    await waitFor(() => expect(signOutOtherAdminSessions).toHaveBeenCalledTimes(1))
    expect(toast.success).toHaveBeenCalledWith('1 other browser signed out.')
  })

  it('disables "sign out all" when this is the only browser', async () => {
    vi.mocked(getAdminSessions).mockResolvedValue([thisBrowser])
    setup()

    await screen.findByText('This browser')
    expect(screen.getByRole('button', { name: 'Sign out all other browsers' })).toBeDisabled()
  })

  it('says why when signing out did not work', async () => {
    const user = userEvent.setup()
    vi.mocked(endAdminSession).mockRejectedValue(new Error('network'))
    setup()

    await user.click(await screen.findByRole('button', { name: 'Sign out Edge on Windows' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not sign that browser out.'),
    )
  })
})
