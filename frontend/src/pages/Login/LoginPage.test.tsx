import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../../api/authApi'
import { createTestQueryClient, resetAuthStore, resetToastStore, testUser } from '../../test/test-utils'
import { useAuthStore } from '../../store/authStore'
import { LoginPage } from './LoginPage'
import { Toaster } from '../../components/ui/Toaster'

vi.mock('../../api/authApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/authApi')>('../../api/authApi')
  return {
    ...actual,
    loginUser: vi.fn(),
  }
})

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderLogin(initialEntry: string | { pathname: string; state?: unknown } = '/login') {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
          <Route path="/dashboard/projects/new" element={<div>New project</div>} />
          <Route path="/admin" element={<div>Admin home</div>} />
        </Routes>
        <LocationDisplay />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetAuthStore()
  resetToastStore()
})

describe('LoginPage redirect', () => {
  it('redirects customers to state.from after successful login', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.loginUser).mockResolvedValue({
      access: 'access-token',
      refresh: 'refresh-token',
      user: testUser,
    })

    renderLogin({
      pathname: '/login',
      state: { from: { pathname: '/dashboard/projects/new' } },
    })

    await user.type(screen.getByLabelText(/email address/i), testUser.email)
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/dashboard/projects/new')
    })
    expect(screen.getByText('New project')).toBeInTheDocument()
  })

  it('redirects already-authenticated customers using state.from', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: testUser,
      isAuthenticated: true,
    })

    renderLogin({
      pathname: '/login',
      state: { from: { pathname: '/dashboard/projects/new' } },
    })

    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard/projects/new')
    expect(screen.getByText('New project')).toBeInTheDocument()
  })

  it('falls back to dashboard when no from state is present', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.loginUser).mockResolvedValue({
      access: 'access-token',
      refresh: 'refresh-token',
      user: testUser,
    })

    renderLogin('/login')

    await user.type(screen.getByLabelText(/email address/i), testUser.email)
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
    })
  })
})
