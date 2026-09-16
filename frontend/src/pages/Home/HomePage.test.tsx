import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthModal } from '../../components/auth/AuthModal'
import { useAuthStore } from '../../store/authStore'
import { useAuthUiStore } from '../../store/authUiStore'
import { createTestQueryClient, resetAuthStore, resetAuthUiStore } from '../../test/test-utils'
import { HomePage } from './HomePage'

function renderHomePage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
        <AuthModal />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetAuthUiStore()
})

describe('HomePage', () => {
  it('shows sign-in and register actions when signed out', async () => {
    const user = userEvent.setup()
    renderHomePage()

    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /go to dashboard/i }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(useAuthUiStore.getState().isOpen).toBe(true)
    expect(screen.getByRole('heading', { name: /create studio account/i })).toBeInTheDocument()
  })

  it('links Browse Marketplace to the home hub', () => {
    renderHomePage()

    expect(screen.getByRole('link', { name: /browse marketplace/i })).toHaveAttribute(
      'href',
      '/home',
    )
  })

  it('shows the dashboard link when signed in', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: null,
      isAuthenticated: true,
    })

    renderHomePage()

    expect(
      screen.getByRole('link', { name: /go to dashboard/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create account/i })).not.toBeInTheDocument()
  })
})
