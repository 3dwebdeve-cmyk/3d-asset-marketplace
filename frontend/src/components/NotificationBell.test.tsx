import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as notificationsApi from '../api/notificationsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../test/test-utils'
import { NotificationBell } from './NotificationBell'

vi.mock('../api/notificationsApi', async () => {
  const actual = await vi.importActual<typeof import('../api/notificationsApi')>(
    '../api/notificationsApi',
  )
  return {
    ...actual,
    getUnreadNotificationCount: vi.fn(),
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  }
})

const sampleNotification = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  title: 'Quotation ready',
  message: 'A quotation is ready for Notification crate.',
  link: '/dashboard/projects/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  is_read: false,
  created_at: '2026-08-03T10:00:00Z',
  updated_at: '2026-08-03T10:00:00Z',
}

function renderBell() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationBell />
        <Routes>
          <Route
            path="/dashboard/projects/:projectId"
            element={<div>Project detail</div>}
          />
          <Route
            path="/dashboard/notifications"
            element={<div>All notifications</div>}
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
  vi.mocked(notificationsApi.getUnreadNotificationCount).mockResolvedValue({
    unread_count: 2,
  })
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
    updated: 2,
    unread_count: 0,
  })
})

describe('NotificationBell', () => {
  it('shows unread badge and opens the notification panel', async () => {
    const user = userEvent.setup()
    renderBell()

    expect(await screen.findByLabelText('Notifications, 2 unread')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /notifications/i }))

    expect(await screen.findByText('Quotation ready')).toBeInTheDocument()
    expect(screen.getByText(sampleNotification.message)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view all notifications/i })).toHaveAttribute(
      'href',
      '/dashboard/notifications',
    )
  })

  it('marks a notification read and navigates to its deep link', async () => {
    const user = userEvent.setup()
    renderBell()

    await user.click(await screen.findByRole('button', { name: /notifications/i }))
    await user.click(await screen.findByRole('button', { name: /quotation ready/i }))

    await waitFor(() => {
      expect(notificationsApi.markNotificationRead).toHaveBeenCalled()
    })
    expect(vi.mocked(notificationsApi.markNotificationRead).mock.calls[0]?.[0]).toBe(
      sampleNotification.id,
    )
    expect(await screen.findByText('Project detail')).toBeInTheDocument()
  })

  it('marks all notifications read', async () => {
    const user = userEvent.setup()
    renderBell()

    await user.click(await screen.findByRole('button', { name: /notifications/i }))
    await user.click(screen.getByRole('button', { name: /mark all read/i }))

    await waitFor(() => {
      expect(notificationsApi.markAllNotificationsRead).toHaveBeenCalled()
    })
  })

  it('shows empty state when there are no notifications', async () => {
    const user = userEvent.setup()
    vi.mocked(notificationsApi.getUnreadNotificationCount).mockResolvedValue({
      unread_count: 0,
    })
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    renderBell()
    await user.click(await screen.findByRole('button', { name: /^notifications$/i }))

    expect(await screen.findByText(/you have no notifications yet/i)).toBeInTheDocument()
  })
})
