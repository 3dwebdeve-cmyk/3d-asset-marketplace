import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../../api/authApi'
import { AuthModal } from './AuthModal'
import { useAuthStore } from '../../store/authStore'
import { useAuthUiStore } from '../../store/authUiStore'
import {
  createTestQueryClient,
  resetAuthStore,
  resetAuthUiStore,
  resetToastStore,
} from '../../test/test-utils'

vi.mock('../../api/authApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/authApi')>('../../api/authApi')
  return {
    ...actual,
    loginUser: vi.fn(),
    registerUser: vi.fn(),
  }
})

function renderAuthModal() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthModal />
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

describe('AuthModal', () => {
  it('renders nothing when closed', () => {
    renderAuthModal()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens in login mode and closes from the backdrop', async () => {
    const user = userEvent.setup()
    useAuthUiStore.getState().open({ mode: 'login' })

    renderAuthModal()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()

    const closeButtons = screen.getAllByRole('button', { name: /close sign in dialog/i })
    await user.click(closeButtons[0]!)

    expect(useAuthUiStore.getState().isOpen).toBe(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('switches between login and register tabs', async () => {
    const user = userEvent.setup()
    useAuthUiStore.getState().open({ mode: 'login' })

    renderAuthModal()

    await user.click(screen.getByRole('button', { name: /^register$/i }))

    expect(useAuthUiStore.getState().mode).toBe('register')
    expect(screen.getByRole('heading', { name: /create an account/i })).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    useAuthUiStore.getState().open({ mode: 'login' })

    renderAuthModal()

    await user.keyboard('{Escape}')

    expect(useAuthUiStore.getState().isOpen).toBe(false)
  })

  it('shows register success without auto-login', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.registerUser).mockResolvedValue({
      id: 'user-1',
      full_name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '',
      country: '',
      avatar: '',
      role: 'Customer',
      email_verified: false,
      created_at: '2026-09-02T00:00:00Z',
    })

    useAuthUiStore.getState().open({ mode: 'register' })
    renderAuthModal()

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace')
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
    await user.type(screen.getByLabelText(/confirm password/i), 'StrongPass123!')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /account created/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/backend terminal/i)).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
