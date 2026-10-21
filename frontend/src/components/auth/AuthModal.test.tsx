import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../../api/authApi'
import { AuthModal } from './AuthModal'
import { loadAuthPanels } from './loadAuthPanels'
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

// The forms are normally downloaded before the dialog opens (see loadAuthPanels.ts).
beforeAll(async () => {
  await loadAuthPanels()
})

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

    await user.click(screen.getByRole('button', { name: /close sign in dialog/i }))

    expect(useAuthUiStore.getState().isOpen).toBe(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('switches between login and register tabs', async () => {
    const user = userEvent.setup()
    useAuthUiStore.getState().open({ mode: 'login' })

    renderAuthModal()

    await user.click(screen.getByRole('button', { name: /^create account$/i }))

    expect(useAuthUiStore.getState().mode).toBe('register')
    expect(screen.getByRole('heading', { name: /create studio account/i })).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    useAuthUiStore.getState().open({ mode: 'login' })

    renderAuthModal()

    await user.keyboard('{Escape}')

    expect(useAuthUiStore.getState().isOpen).toBe(false)
  })

  it('traps Tab focus inside the dialog', async () => {
    const user = userEvent.setup()
    useAuthUiStore.getState().open({ mode: 'login' })

    renderAuthModal()

    const dialog = screen.getByRole('dialog')
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => {
      const style = window.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden'
    })

    expect(focusable.length).toBeGreaterThan(1)

    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!

    last.focus()
    await user.tab()
    expect(document.activeElement).toBe(first)

    first.focus()
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(last)
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
    await user.type(screen.getByLabelText(/email id/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
    await user.type(screen.getByLabelText(/confirm password/i), 'StrongPass123!')
    await user.click(screen.getByLabelText(/i agree to 3d hub/i))
    await user.click(screen.getByRole('button', { name: /create free studio account/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/verification link/i)).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
