import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../../api/authApi'
import { useAuthStore } from '../../store/authStore'
import { createTestQueryClient, resetAuthStore, testUser } from '../../test/test-utils'
import { DashboardPage } from './DashboardPage'

function renderDashboard(initialPath = '/dashboard') {
  const queryClient = createTestQueryClient()
  useAuthStore.setState({
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    user: testUser,
    isAuthenticated: true,
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/projects" element={<div>My projects page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  vi.restoreAllMocks()
})

describe('DashboardPage', () => {
  it('links to My projects from the customer dashboard', async () => {
    const user = userEvent.setup()
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(testUser)

    renderDashboard()

    expect(await screen.findByText(testUser.email)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /my projects/i })
    expect(link).toHaveAttribute('href', '/dashboard/projects')

    await user.click(link)
    expect(await screen.findByText('My projects page')).toBeInTheDocument()
  })

  it('hides the change-password form until Change password is clicked, then submits', async () => {
    const user = userEvent.setup()
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue(testUser)
    const changePassword = vi.spyOn(authApi, 'changePassword').mockResolvedValue(undefined)

    renderDashboard()

    expect(await screen.findByText(testUser.email)).toBeInTheDocument()
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^change password$/i }))

    await user.type(screen.getByLabelText(/current password/i), 'StrongPass123!')
    await user.type(screen.getByLabelText(/^new password$/i), 'AnotherStrong123!')
    await user.type(screen.getByLabelText(/confirm new password/i), 'AnotherStrong123!')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalled()
    })

    expect(changePassword.mock.calls[0][0]).toEqual({
      current_password: 'StrongPass123!',
      new_password: 'AnotherStrong123!',
      new_password_confirm: 'AnotherStrong123!',
    })
  })
})
