import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../../api/authApi'
import { useAuthStore } from '../../store/authStore'
import { createTestQueryClient, resetAuthStore, resetToastStore, testUser } from '../../test/test-utils'
import { AdminLoginPage } from './AdminLoginPage'

vi.mock('../../api/authApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/authApi')>('../../api/authApi')
  return {
    ...actual,
    adminLoginUser: vi.fn(),
  }
})

function renderAdminLogin() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/console/login']}>
        <Routes>
          <Route path="/console/login" element={<AdminLoginPage />} />
          <Route path="/console" element={<div>Admin Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
})

describe('AdminLoginPage', () => {
  it('renders email and password fields only', () => {
    renderAdminLogin()

    expect(screen.getByRole('heading', { name: /admin sign in/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /register/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /forgot password/i })).not.toBeInTheDocument()
  })

  it('redirects administrators who are already signed in', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      user: { ...testUser, role: 'Administrator', email: 'admin@example.com' },
      isAuthenticated: true,
    })

    renderAdminLogin()

    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
  })

  it('signs in administrators and navigates to /console', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.adminLoginUser).mockResolvedValue({
      access: 'access-token',
      user: { ...testUser, role: 'Administrator', email: 'admin@example.com' },
    })

    renderAdminLogin()

    await user.type(screen.getByLabelText(/email address/i), 'admin@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
    })
    expect(authApi.adminLoginUser).toHaveBeenCalled()
    expect(vi.mocked(authApi.adminLoginUser).mock.calls[0]?.[0]).toEqual({
      email: 'admin@example.com',
      password: 'StrongPass123!',
      remember_me: true,
    })
  })
})
