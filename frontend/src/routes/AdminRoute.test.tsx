import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '../store/authStore'
import { resetAuthStore, testUser } from '../test/test-utils'
import { AdminRoute } from './AdminRoute'

function renderAdminRoutes(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/admin/login" element={<div>Admin Login Page</div>} />
        <Route path="/dashboard" element={<div>Customer Dashboard</div>} />
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<div>Admin Dashboard</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  resetAuthStore()
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

  it('allows administrators into the admin shell', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { ...testUser, role: 'Administrator', email: 'admin@example.com' },
      isAuthenticated: true,
    })

    renderAdminRoutes('/admin')

    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
  })
})
