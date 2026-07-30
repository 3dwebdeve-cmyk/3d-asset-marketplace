import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetAuthStore, testUser } from '../../test/test-utils'
import { useAuthStore } from '../../store/authStore'
import { CustomProjectsLandingPage } from './CustomProjectsLandingPage'

function renderLanding() {
  return render(
    <MemoryRouter>
      <CustomProjectsLandingPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  resetAuthStore()
})

describe('CustomProjectsLandingPage', () => {
  it('links guests to login with redirect state toward the request form', () => {
    renderLanding()

    const cta = screen.getByRole('link', { name: /sign in to request a project/i })
    expect(cta).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute(
      'href',
      '/register',
    )
  })

  it('links authenticated customers to the project request form', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: testUser,
      isAuthenticated: true,
    })

    renderLanding()

    expect(screen.getByRole('link', { name: /start a project request/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/new',
    )
    expect(screen.queryByRole('link', { name: /create an account/i })).not.toBeInTheDocument()
  })

  it('links administrators to admin projects instead of the customer request form', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
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
