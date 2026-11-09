import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAdminNotifications, markAdminNotificationsRead } from '../../api/adminNotificationsApi'
import { createTestQueryClient } from '../../test/test-utils'
import { AdminNotifications } from './AdminNotifications'

vi.mock('../../api/adminNotificationsApi', () => ({ getAdminNotifications: vi.fn(), markAdminNotificationsRead: vi.fn() }))
const data = { unread_count: 1, results: [{ id: 'notice-1', title: 'Model waiting for approval: Chair',
  path: '/console/products/chair', created_at: '2026-11-09T00:00:00Z', is_read: false }] }
function setup() {
  render(<QueryClientProvider client={createTestQueryClient()}><MemoryRouter initialEntries={['/console']}>
    <Routes><Route path="/console" element={<AdminNotifications />} />
      <Route path="/console/products/chair" element={<p>Review Chair</p>} /></Routes>
  </MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getAdminNotifications).mockResolvedValue(data)
  vi.mocked(markAdminNotificationsRead).mockResolvedValue(undefined)
})
describe('AdminNotifications', () => {
  it('shows unread count, opens the record and marks it read', async () => {
    const user = userEvent.setup()
    setup()
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' })
    await user.click(bell)
    await user.click(await screen.findByRole('link', { name: /Model waiting for approval: Chair/ }))
    expect(markAdminNotificationsRead).toHaveBeenCalledWith('notice-1')
    expect(await screen.findByText('Review Chair')).toBeInTheDocument()
  })
  it('marks all as read and supports Escape and outside dismissal', async () => {
    const user = userEvent.setup()
    setup()
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' })
    await user.click(bell)
    vi.mocked(getAdminNotifications).mockResolvedValue({ unread_count: 0, results: [{ ...data.results[0], is_read: true }] })
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument())
    expect(markAdminNotificationsRead).toHaveBeenCalledWith(undefined)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Admin notifications' })).not.toBeInTheDocument()
    expect(bell).toHaveFocus()
    await user.click(bell)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('region', { name: 'Admin notifications' })).not.toBeInTheDocument()
  })
  it('shows an empty state', async () => {
    vi.mocked(getAdminNotifications).mockResolvedValue({ unread_count: 0, results: [] })
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(await screen.findByText('No notifications yet.')).toBeInTheDocument()
  })
  it('handles loading failure and retries', async () => {
    vi.mocked(getAdminNotifications).mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    await screen.findByText(/Could not load notifications/)
    vi.mocked(getAdminNotifications).mockResolvedValue(data)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: /Model waiting for approval: Chair/ })).toBeInTheDocument()
  })
  it('keeps a notification available when marking it read fails', async () => {
    vi.mocked(markAdminNotificationsRead).mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }))
    await user.click(screen.getByRole('link', { name: /Model waiting for approval: Chair/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not mark as read')
    expect(screen.queryByText('Review Chair')).not.toBeInTheDocument()
  })
})
