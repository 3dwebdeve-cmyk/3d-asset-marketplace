import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../api/authApi'
import * as cartApi from '../api/cartApi'
import * as wishlistApi from '../api/wishlistApi'
import { ProtectedRoute } from '../routes/ProtectedRoute'
import { useAuthStore } from '../store/authStore'
import { createTestQueryClient, resetAuthStore, testUser } from '../test/test-utils'
import { Navbar } from './Navbar'

vi.mock('../api/authApi', async () => {
  const actual = await vi.importActual<typeof import('../api/authApi')>('../api/authApi')
  return {
    ...actual,
    logoutUser: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('../api/cartApi', async () => {
  const actual = await vi.importActual<typeof import('../api/cartApi')>('../api/cartApi')
  return {
    ...actual,
    getCart: vi.fn(),
  }
})

vi.mock('../api/wishlistApi', async () => {
  const actual = await vi.importActual<typeof import('../api/wishlistApi')>('../api/wishlistApi')
  return {
    ...actual,
    listWishlistItems: vi.fn(),
  }
})

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderNavbar(initialPath = '/') {
  const queryClient = createTestQueryClient()

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Navbar />
        <Routes>
          <Route path="/" element={<div>Home page</div>} />
          <Route path="/login" element={<div>Sign in page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Dashboard page</div>} />
            <Route path="/dashboard/projects" element={<div>My projects page</div>} />
            <Route path="/dashboard/wishlist" element={<div>Wishlist page</div>} />
            <Route path="/profile" element={<div>Profile page</div>} />
          </Route>
        </Routes>
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  vi.clearAllMocks()
  vi.mocked(wishlistApi.listWishlistItems).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  vi.mocked(cartApi.getCart).mockResolvedValue({
    id: 'cart-id',
    currency: 'USD',
    subtotal: '0.00',
    item_count: 0,
    total_quantity: 0,
    items: [],
  })
})

describe('Navbar', () => {
  it('shows Sign in and Register when logged out', () => {
    renderNavbar()

    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /register/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })

  it('shows user name, Dashboard, My Projects, My Orders, My Downloads, Wishlist, Profile, and Sign out when logged in', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: testUser,
      isAuthenticated: true,
    })

    renderNavbar()

    expect(screen.getByText(testUser.full_name)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my projects/i })).toHaveAttribute(
      'href',
      '/dashboard/projects',
    )
    expect(screen.getByRole('link', { name: /my orders/i })).toHaveAttribute(
      'href',
      '/dashboard/orders',
    )
    expect(screen.getByRole('link', { name: /my downloads/i })).toHaveAttribute(
      'href',
      '/dashboard/downloads',
    )
    expect(screen.getByRole('button', { name: /^cart$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^wishlist$/i })).toHaveAttribute(
      'href',
      '/dashboard/wishlist',
    )
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^register$/i })).not.toBeInTheDocument()
  })

  it('shows a cart count badge when the customer has items in cart', async () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: testUser,
      isAuthenticated: true,
    })
    vi.mocked(cartApi.getCart).mockResolvedValue({
      id: 'cart-id',
      currency: 'USD',
      subtotal: '59.98',
      item_count: 2,
      total_quantity: 3,
      items: [],
    })

    renderNavbar()

    expect(await screen.findByLabelText('3 items in cart')).toHaveTextContent('3')
  })

  it('shows a wishlist count badge when the customer has saved items', async () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: testUser,
      isAuthenticated: true,
    })
    vi.mocked(wishlistApi.listWishlistItems).mockResolvedValue({
      count: 3,
      next: null,
      previous: null,
      results: [],
    })

    renderNavbar()

    expect(await screen.findByLabelText('3 saved items')).toHaveTextContent('3')
  })

  it('shows Admin and Profile for administrators', () => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { ...testUser, role: 'Administrator', email: 'admin@example.com' },
      isAuthenticated: true,
    })

    renderNavbar()

    expect(screen.getByRole('link', { name: /^admin$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /my projects/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /my orders/i })).not.toBeInTheDocument()
  })

  it('navigates to the home page after sign out from a protected route', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: testUser,
      isAuthenticated: true,
    })

    renderNavbar('/dashboard')
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    })
    expect(screen.getByText('Home page')).toBeInTheDocument()
    expect(screen.queryByText('Sign in page')).not.toBeInTheDocument()
    expect(authApi.logoutUser).toHaveBeenCalledWith('refresh-token')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
  })
})
