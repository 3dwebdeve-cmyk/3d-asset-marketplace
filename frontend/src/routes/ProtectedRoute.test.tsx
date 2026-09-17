import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '../store/authStore'
import { resetAuthStore } from '../test/test-utils'
import { ProtectedRoute } from './ProtectedRoute'

function renderProtectedRoutes(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<div>Home Page</div>} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
          <Route path="/dashboard/projects" element={<div>My Projects Content</div>} />
          <Route
            path="/dashboard/projects/:projectId"
            element={<div>Project Detail Content</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  resetAuthStore()
})

describe('ProtectedRoute', () => {
  it('redirects to login when the user is not authenticated', () => {
    renderProtectedRoutes('/dashboard')

    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument()
  })

  it('redirects to home after intentional sign-out', () => {
    useAuthStore.setState({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      postLogoutRedirect: '/',
    })

    renderProtectedRoutes('/dashboard')

    expect(screen.getByText('Home Page')).toBeInTheDocument()
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
  })

  it('renders the protected content when the user is authenticated', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      user: null,
      isAuthenticated: true,
    })

    renderProtectedRoutes('/dashboard')

    expect(screen.getByText('Dashboard Content')).toBeInTheDocument()
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
  })

  it('redirects when authenticated flag is set but the access token is missing', () => {
    useAuthStore.setState({
      accessToken: null,
      user: null,
      isAuthenticated: true,
    })

    renderProtectedRoutes('/dashboard')

    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('redirects unauthenticated users away from My Projects', () => {
    renderProtectedRoutes('/dashboard/projects')
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('My Projects Content')).not.toBeInTheDocument()
  })

  it('redirects unauthenticated users away from project detail', () => {
    renderProtectedRoutes('/dashboard/projects/11111111-1111-1111-1111-111111111111')
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Project Detail Content')).not.toBeInTheDocument()
  })

  it('allows authenticated users onto My Projects', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      user: null,
      isAuthenticated: true,
    })

    renderProtectedRoutes('/dashboard/projects')
    expect(screen.getByText('My Projects Content')).toBeInTheDocument()
  })

  it('allows authenticated users onto project detail', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      user: null,
      isAuthenticated: true,
    })

    renderProtectedRoutes('/dashboard/projects/11111111-1111-1111-1111-111111111111')
    expect(screen.getByText('Project Detail Content')).toBeInTheDocument()
  })
})
