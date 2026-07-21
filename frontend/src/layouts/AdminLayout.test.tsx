import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../api/authApi'
import { AdminLayout } from '../layouts/AdminLayout'
import { useAuthStore } from '../store/authStore'
import { createTestQueryClient, resetAuthStore, testUser } from '../test/test-utils'

vi.mock('../api/authApi', async () => {
  const actual = await vi.importActual<typeof import('../api/authApi')>('../api/authApi')
  return {
    ...actual,
    getAdminCurrentUser: vi.fn(),
    logoutUser: vi.fn().mockResolvedValue(undefined),
  }
})

const adminUser = {
  ...testUser,
  role: 'Administrator' as const,
  email: 'admin@example.com',
}

function renderAdminLayout(initialEntry = '/admin') {
  const queryClient = createTestQueryClient()

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<div>Admin dashboard content</div>} />
            <Route path="/admin/products" element={<div>Admin products content</div>} />
            <Route
              path="/admin/products/:productId"
              element={<div>Admin product detail content</div>}
            />
          </Route>
          <Route path="/admin/login" element={<div>Admin login page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  vi.clearAllMocks()
  useAuthStore.setState({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: adminUser,
    isAuthenticated: true,
  })
  vi.mocked(authApi.getAdminCurrentUser).mockResolvedValue(adminUser)
})

describe('AdminLayout', () => {
  it('renders sidebar navigation and page content', async () => {
    renderAdminLayout()

    expect(screen.getByRole('navigation', { name: /admin sections/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^dashboard$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^products$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^categories$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^users$/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Admin dashboard content')).toBeInTheDocument()
    })
    expect(screen.getByText(adminUser.full_name)).toBeInTheDocument()
  })

  it('highlights the active route and detail pages under the parent section', async () => {
    const user = userEvent.setup()
    renderAdminLayout('/admin/products/b3d66e20-e133-4506-a6c5-a47d2ee5cd00')

    await waitFor(() => {
      expect(screen.getByText('Admin product detail content')).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: /^products$/i })).toHaveClass(
      'admin-sidebar__link--active',
    )
    expect(screen.getByRole('link', { name: /^dashboard$/i })).not.toHaveClass(
      'admin-sidebar__link--active',
    )

    await user.click(screen.getByRole('link', { name: /^dashboard$/i }))

    await waitFor(() => {
      expect(screen.getByText('Admin dashboard content')).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /^dashboard$/i })).toHaveClass(
      'admin-sidebar__link--active',
    )
  })

  it('shows coming soon items as disabled navigation entries', async () => {
    renderAdminLayout()

    await waitFor(() => {
      expect(screen.getByText('Admin dashboard content')).toBeInTheDocument()
    })

    expect(screen.getByText('Plugins')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Projects')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Analytics')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('link', { name: /^plugins$/i })).not.toBeInTheDocument()
  })

  it('signs out administrators to the admin login page', async () => {
    const user = userEvent.setup()
    renderAdminLayout()

    await waitFor(() => {
      expect(screen.getByText('Admin dashboard content')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => {
      expect(screen.getByText('Admin login page')).toBeInTheDocument()
    })
    expect(authApi.logoutUser).toHaveBeenCalledWith('refresh-token')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
