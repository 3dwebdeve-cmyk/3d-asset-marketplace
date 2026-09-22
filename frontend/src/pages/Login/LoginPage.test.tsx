import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../../api/authApi'
import { AuthModal } from '../../components/auth/AuthModal'
import { Toaster } from '../../components/ui/Toaster'
import { useAuthStore } from '../../store/authStore'
import { useAuthUiStore } from '../../store/authUiStore'
import {
  createTestQueryClient,
  resetAuthStore,
  resetAuthUiStore,
  resetToastStore,
  testUser,
} from '../../test/test-utils'
import { LoginPage } from './LoginPage'

vi.mock('../../api/authApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/authApi')>('../../api/authApi')
  return {
    ...actual,
    loginUser: vi.fn(),
  }
})

function LocationDisplay() {
  const location = useLocation()
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  )
}

function renderLogin(initialEntry: string | { pathname: string; state?: unknown } = '/login') {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/home" element={<div>Marketplace home</div>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<div>Forgot password page</div>} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
          <Route path="/dashboard/projects/new" element={<div>New project</div>} />
          <Route path="/checkout/success" element={<div>Checkout success</div>} />
          <Route path="/console" element={<div>Admin home</div>} />
        </Routes>
        <AuthModal />
        <LocationDisplay />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetAuthStore()
  resetAuthUiStore()
  resetToastStore()
})

describe('LoginPage redirect', () => {
  it('opens the login modal on home and redirects customers to state.from after successful login', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.loginUser).mockResolvedValue({
      access: 'access-token',
      user: testUser,
    })

    renderLogin({
      pathname: '/login',
      state: { from: { pathname: '/dashboard/projects/new' } },
    })

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/email id/i), testUser.email)
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
    await user.click(
      within(screen.getByRole('form', { name: /welcome back/i })).getByRole('button', {
        name: /sign in to 3d hub/i,
      }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/dashboard/projects/new')
    })
    expect(screen.getByText('New project')).toBeInTheDocument()
  })

  it('preserves checkout success query string from state.from after login', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.loginUser).mockResolvedValue({
      access: 'access-token',
      user: testUser,
    })

    renderLogin({
      pathname: '/login',
      state: {
        from: { pathname: '/checkout/success', search: '?order_id=order-99' },
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/email id/i), testUser.email)
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
    await user.click(
      within(screen.getByRole('form', { name: /welcome back/i })).getByRole('button', {
        name: /sign in to 3d hub/i,
      }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/checkout/success?order_id=order-99',
      )
    })
    expect(screen.getByText('Checkout success')).toBeInTheDocument()
  })

  it('redirects already-authenticated customers using state.from', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
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
      user: testUser,
    })

    renderLogin('/login')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/remember this device/i)).toBeChecked()

    await user.type(screen.getByLabelText(/email id/i), testUser.email)
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
    await user.click(
      within(screen.getByRole('form', { name: /welcome back/i })).getByRole('button', {
        name: /sign in to 3d hub/i,
      }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
    })
  })

  it('never persists access tokens in localStorage', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.loginUser).mockResolvedValue({
      access: 'access-token',
      user: testUser,
    })

    renderLogin('/login')

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/email id/i), testUser.email)
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
    await user.click(
      within(screen.getByRole('form', { name: /welcome back/i })).getByRole('button', {
        name: /sign in to 3d hub/i,
      }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(useAuthStore.getState().accessToken).toBe('access-token')
    expect(localStorage.getItem('auth-storage')).not.toMatch(/access-token|accessToken/)
  })

  it('sends remember_me false when Remember me is unchecked', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.loginUser).mockResolvedValue({
      access: 'access-token',
      user: testUser,
    })

    renderLogin('/login')

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/email id/i), testUser.email)
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
    await user.click(screen.getByLabelText(/remember this device/i))
    await user.click(
      within(screen.getByRole('form', { name: /welcome back/i })).getByRole('button', {
        name: /sign in to 3d hub/i,
      }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
    })
    expect(authApi.loginUser).toHaveBeenCalledWith(
      expect.objectContaining({ remember_me: false }),
    )
    expect(useAuthStore.getState().rememberSession).toBe(false)
    expect(localStorage.getItem('auth-storage')).not.toMatch(/access-token|accessToken/)
  })

  it('navigates to forgot password when the link is clicked', async () => {
    const user = userEvent.setup()

    renderLogin('/login')

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /forgot password/i }))

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/forgot-password')
      expect(screen.getByText('Forgot password page')).toBeInTheDocument()
    })
    expect(useAuthUiStore.getState().isOpen).toBe(false)
  })
})
