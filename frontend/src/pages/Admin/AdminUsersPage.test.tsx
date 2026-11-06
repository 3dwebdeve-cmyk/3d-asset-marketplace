import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '../../api/authApi'
import { createTestQueryClient } from '../../test/test-utils'
import { AdminUsersPage } from './AdminUsersPage'

vi.mock('../../api/authApi', async () => ({
  ...await vi.importActual<typeof import('../../api/authApi')>('../../api/authApi'),
  listAdminUsers: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(authApi.listAdminUsers).mockResolvedValue({ count: 21, next: null, previous: null, results: [] })
})

function renderPage() {
  render(<QueryClientProvider client={createTestQueryClient()}><MemoryRouter><AdminUsersPage /></MemoryRouter></QueryClientProvider>)
}

describe('AdminUsersPage', () => {
  it('paginates users and resets to the first page when filtering by status', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(authApi.listAdminUsers).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, page_size: 10 })))
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'inactive')
    await waitFor(() => expect(authApi.listAdminUsers).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, is_active: false })))
  })
})
