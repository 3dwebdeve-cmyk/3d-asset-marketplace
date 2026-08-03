import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as notificationsApi from '../../api/notificationsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { NotificationsPage } from './NotificationsPage'

vi.mock('../../api/notificationsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/notificationsApi')>(
    '../../api/notificationsApi',
  )
  return {
    ...actual,
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  }
})

const sampleNotification = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  title: 'Order status updated',
  message: 'Order INV-1 is now paid.',
  link: '/dashboard/orders/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  is_read: false,
  created_at: '2026-08-03T10:00:00Z',
  updated_at: '2026-08-03T10:00:00Z',
}

function renderPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  vi.mocked(notificationsApi.listNotifications).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [sampleNotification],
  })
  vi.mocked(notificationsApi.markNotificationRead).mockResolvedValue({
    ...sampleNotification,
    is_read: true,
  })
  vi.mocked(notificationsApi.markAllNotificationsRead).mockResolvedValue({
    updated: 1,
    unread_count: 0,
  })
})

describe('NotificationsPage', () => {
  it('renders notification rows with open and mark-read actions', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /^notifications$/i })).toBeInTheDocument()
    expect(await screen.findByText('Order status updated')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^open$/i })).toHaveAttribute(
      'href',
      sampleNotification.link,
    )
  })

  it('filters to unread only', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Order status updated')
    await user.click(screen.getByLabelText(/unread only/i))

    await waitFor(() => {
      expect(notificationsApi.listNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ is_read: false, page: 1 }),
      )
    })
  })

  it('marks all notifications read', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Order status updated')
    await user.click(screen.getByRole('button', { name: /mark all read/i }))

    await waitFor(() => {
      expect(notificationsApi.markAllNotificationsRead).toHaveBeenCalled()
    })
  })
})
