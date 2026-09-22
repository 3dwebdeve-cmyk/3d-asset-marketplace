import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../api/authApi'
import { DashboardLayout } from './DashboardLayout'
import { useAuthStore } from '../store/authStore'
import { createTestQueryClient, resetAuthStore, testUser } from '../test/test-utils'

vi.mock('../api/authApi', () => ({
  logoutUser: vi.fn().mockResolvedValue(undefined),
}))

function renderLayout(initialPath = '/dashboard/projects') {
  const queryClient = createTestQueryClient()
  useAuthStore.setState({
    accessToken: 'test-access-token',
    user: testUser,
    isAuthenticated: true,
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<div>Home content</div>} />
            <Route path="/dashboard/projects" element={<div>Projects content</div>} />
            <Route path="/dashboard/wishlist" element={<div>Wishlist content</div>} />
            <Route path="/dashboard/projects/new" element={<div>New project form</div>} />
            <Route path="/" element={<div>Home</div>} />
            <Route path="/home" element={<div>Marketplace home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  vi.clearAllMocks()
})

describe('DashboardLayout', () => {
  it('renders add-project CTA and sidebar nav', () => {
    renderLayout()

    expect(screen.queryByRole('link', { name: /3d hub/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /request a new project/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/new',
    )
    expect(screen.getByRole('link', { name: /^dashboard$/i })).toHaveAttribute(
      'href',
      '/dashboard',
    )
    expect(screen.getByRole('link', { name: /my projects/i })).toHaveAttribute(
      'href',
      '/dashboard/projects',
    )
    expect(screen.getByRole('link', { name: /^wishlist$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my orders/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my downloads/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /edit profile/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /change password/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
    expect(screen.getByText('Projects content')).toBeInTheDocument()
  })

  it('marks Dashboard as active on the home route only', () => {
    renderLayout('/dashboard')

    const dashboardLink = screen.getByRole('link', { name: /^dashboard$/i })
    expect(dashboardLink).toHaveClass('dashboard-sidebar__link--active')
    expect(screen.getByRole('link', { name: /my projects/i })).not.toHaveClass(
      'dashboard-sidebar__link--active',
    )
    expect(screen.getByText('Home content')).toBeInTheDocument()
  })

  it('marks My Projects as active on nested project routes', () => {
    renderLayout('/dashboard/projects')

    const projectsLink = screen.getByRole('link', { name: /my projects/i })
    expect(projectsLink).toHaveClass('dashboard-sidebar__link--active')
    expect(screen.getByRole('link', { name: /^dashboard$/i })).not.toHaveClass(
      'dashboard-sidebar__link--active',
    )
  })

  it('navigates to request a new project from the sidebar CTA', async () => {
    const user = userEvent.setup()
    renderLayout()

    await user.click(screen.getByRole('link', { name: /request a new project/i }))
    expect(await screen.findByText('New project form')).toBeInTheDocument()
  })

  it('signs out and clears the session', async () => {
    const user = userEvent.setup()
    renderLayout()

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => {
      expect(authApi.logoutUser).toHaveBeenCalled()
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
