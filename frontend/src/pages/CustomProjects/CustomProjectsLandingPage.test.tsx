import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthModal } from '../../components/auth/AuthModal'
import { useAuthStore } from '../../store/authStore'
import { useAuthUiStore } from '../../store/authUiStore'
import {
  createTestQueryClient,
  resetAuthStore,
  resetAuthUiStore,
  testUser,
} from '../../test/test-utils'
import { CustomProjectsLandingPage } from './CustomProjectsLandingPage'

function renderLanding() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CustomProjectsLandingPage />
        <AuthModal />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetAuthUiStore()
})

describe('CustomProjectsLandingPage', () => {
  it('opens login for guests with redirect toward the request form', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByRole('button', { name: /sign in to request a project/i }))

    expect(useAuthUiStore.getState().isOpen).toBe(true)
    expect(useAuthUiStore.getState().returnTo).toBe('/dashboard/projects/new')
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create an account/i })).toBeInTheDocument()
  })

  it('links authenticated customers to the project request form', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      user: testUser,
      isAuthenticated: true,
    })

    renderLanding()

    expect(screen.getByRole('link', { name: /start a project request/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/new',
    )
    expect(screen.queryByRole('button', { name: /create an account/i })).not.toBeInTheDocument()
  })

  it('links administrators to admin projects instead of the customer request form', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      user: { ...testUser, role: 'Administrator', email: 'admin@example.com' },
      isAuthenticated: true,
    })

    renderLanding()

    expect(screen.getByRole('link', { name: /open admin projects/i })).toHaveAttribute(
      'href',
      '/admin/projects',
    )
  })
})
