import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../api/authApi'
import { useAuthStore } from '../store/authStore'
import { createTestQueryClient, resetAuthStore, testUser } from '../test/test-utils'
import { AdminRoute } from './AdminRoute'

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

function renderAdminRoutes(initialEntry: string) {
  const queryClient = createTestQueryClient()

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/admin/login" element={<div>Admin Login Page</div>} />
          <Route path="/dashboard" element={<div>Customer Dashboard</div>} />
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<div>Admin Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  vi.clearAllMocks()
  vi.mocked(authApi.getAdminCurrentUser).mockResolvedValue(adminUser)
})

describe('AdminRoute', () => {
  it('redirects anonymous users to admin login', () => {
    renderAdminRoutes('/admin')

    expect(screen.getByText('Admin Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Admin Dashboard')).not.toBeInTheDocument()
  })

  it('redirects customers away from the admin shell', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: testUser,
      isAuthenticated: true,
    })

    renderAdminRoutes('/admin')

    expect(screen.getByText('Customer Dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Admin Dashboard')).not.toBeInTheDocument()
  })

  it('allows administrators into the admin shell', async () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: adminUser,
      isAuthenticated: true,
    })

    renderAdminRoutes('/admin')

    await waitFor(() => {
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
    })
    expect(screen.getByRole('navigation', { name: /admin sections/i })).toBeInTheDocument()
  })
})
