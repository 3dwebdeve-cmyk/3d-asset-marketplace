import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../../api/authApi'
import { AuthModal } from '../../components/auth/AuthModal'
import { useAuthUiStore } from '../../store/authUiStore'
import { createTestQueryClient, resetAuthStore, resetAuthUiStore } from '../../test/test-utils'
import { RegisterPage } from './RegisterPage'

vi.mock('../../api/authApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/authApi')>('../../api/authApi')
  return {
    ...actual,
    registerUser: vi.fn(),
  }
})

function renderRegister() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
        <AuthModal />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetAuthStore()
  resetAuthUiStore()
})

describe('RegisterPage', () => {
  it('submits phone and country with the rest of the register payload', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.registerUser).mockResolvedValue({
      id: 'user-1',
      full_name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+91 98765 43210',
      country: 'India',
      avatar: '',
      role: 'Customer',
      email_verified: false,
      created_at: '2026-09-02T00:00:00Z',
    })

    renderRegister()

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace')
    await user.type(screen.getByLabelText(/email id/i), 'Ada@Example.com')
    await user.type(screen.getByLabelText(/phone number/i), '+91 98765 43210')
    await user.type(screen.getByLabelText(/country \(optional\)/i), 'India')
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
    await user.type(screen.getByLabelText(/confirm password/i), 'StrongPass123!')
    await user.click(screen.getByLabelText(/i agree to 3d hub/i))
    await user.click(screen.getByRole('button', { name: /create free studio account/i }))

    await waitFor(() => {
      expect(authApi.registerUser).toHaveBeenCalled()
    })
    expect(vi.mocked(authApi.registerUser).mock.calls[0]?.[0]).toEqual({
      full_name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'StrongPass123!',
      password_confirm: 'StrongPass123!',
      phone: '+91 98765 43210',
      country: 'India',
    })
    expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument()
  })

  it('switches to login mode from the Sign In tab', async () => {
    const user = userEvent.setup()

    renderRegister()

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(useAuthUiStore.getState().mode).toBe('login')
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
  })
})
