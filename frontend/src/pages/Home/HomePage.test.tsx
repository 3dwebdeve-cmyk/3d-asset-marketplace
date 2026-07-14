import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '../../store/authStore'
import { resetAuthStore } from '../../test/test-utils'
import { HomePage } from './HomePage'

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  resetAuthStore()
})

describe('HomePage', () => {
  it('shows sign-in and register links when signed out', () => {
    renderHomePage()

    expect(screen.getByRole('link', { name: /create account/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /go to dashboard/i }),
    ).not.toBeInTheDocument()
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
    expect(screen.queryByRole('link', { name: /create account/i })).not.toBeInTheDocument()
  })
})
