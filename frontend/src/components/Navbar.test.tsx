import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../api/authApi'
import * as cartApi from '../api/cartApi'
import * as categoriesApi from '../api/categoriesApi'
import * as notificationsApi from '../api/notificationsApi'
import * as pluginsApi from '../api/pluginsApi'
import * as wishlistApi from '../api/wishlistApi'
import { AuthModal } from './auth/AuthModal'
import { ProtectedRoute } from '../routes/ProtectedRoute'
import { useAuthStore } from '../store/authStore'
import { createTestQueryClient, resetAuthStore, resetAuthUiStore, testUser } from '../test/test-utils'
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

vi.mock('../api/notificationsApi', async () => {
  const actual = await vi.importActual<typeof import('../api/notificationsApi')>(
    '../api/notificationsApi',
  )
  return {
    ...actual,
    getUnreadNotificationCount: vi.fn(),
    listNotifications: vi.fn(),
  }
})

vi.mock('../api/categoriesApi', async () => {
  const actual = await vi.importActual<typeof import('../api/categoriesApi')>(
    '../api/categoriesApi',
  )
  return {
    ...actual,
    listPublicCategories: vi.fn(),
  }
})

vi.mock('../api/pluginsApi', async () => {
  const actual = await vi.importActual<typeof import('../api/pluginsApi')>('../api/pluginsApi')
  return {
    ...actual,
    listPublicPluginCategories: vi.fn(),
  }
})

function LocationDisplay() {
  const location = useLocation()
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  )
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
          <Route path="/products" element={<div>Products page</div>} />
          <Route path="/3d-models" element={<div>3D Models page</div>} />
          <Route path="/plugins" element={<div>Plugins page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Dashboard page</div>} />
            <Route path="/dashboard/projects" element={<div>My projects page</div>} />
            <Route path="/dashboard/wishlist" element={<div>Wishlist page</div>} />
            <Route path="/profile" element={<div>Profile page</div>} />
          </Route>
        </Routes>
        <AuthModal />
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openAccountMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /hi,/i }))
  return screen.getByRole('menu')
}

beforeEach(() => {
  resetAuthStore()
  resetAuthUiStore()
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
    discount_amount: '0.00',
    total: '0.00',
    item_count: 0,
    total_quantity: 0,
    coupon: null,
    items: [],
  })
  vi.mocked(notificationsApi.getUnreadNotificationCount).mockResolvedValue({
    unread_count: 0,
  })
  vi.mocked(notificationsApi.listNotifications).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  vi.mocked(categoriesApi.listPublicCategories).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  vi.mocked(pluginsApi.listPublicPluginCategories).mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
})

describe('Navbar', () => {
  it('shows Sign in and Register when logged out', () => {
    renderNavbar()

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^about$/i })).toHaveAttribute('href', '/about')
    expect(screen.getByRole('link', { name: /^contact$/i })).toHaveAttribute('href', '/contact')
    expect(screen.getByRole('link', { name: /^custom projects$/i })).toHaveAttribute(
      'href',
      '/custom-projects',
    )
    expect(screen.getByRole('link', { name: /^home$/i })).toHaveAttribute('href', '/products')
    expect(screen.getByRole('link', { name: /^3d model$/i })).toHaveAttribute('href', '/3d-models')
    expect(screen.getByRole('link', { name: /^plugins$/i })).toHaveAttribute('href', '/plugins')
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })

  it('shows user menu with Dashboard, My Projects, My Orders, My Downloads, Wishlist, Profile, and Sign out when logged in', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { ...testUser, avatar: 'https://cdn.example.com/avatar.jpg' },
      isAuthenticated: true,
    })

    renderNavbar()

    const firstName = testUser.full_name.trim().split(/\s+/)[0]
    expect(screen.getByText(`Hi, ${firstName}`)).toBeInTheDocument()
    expect(document.querySelector('.navbar__account-avatar')).toHaveAttribute(
      'src',
      'https://cdn.example.com/avatar.jpg',
    )
    expect(screen.getByRole('button', { name: /^notifications$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cart$/i })).toBeInTheDocument()

    const menu = await openAccountMenu(user)
    expect(within(menu).getByRole('menuitem', { name: /dashboard/i })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /my projects/i })).toHaveAttribute(
      'href',
      '/dashboard/projects',
    )
    expect(within(menu).getByRole('menuitem', { name: /my orders/i })).toHaveAttribute(
      'href',
      '/dashboard/orders',
    )
    expect(within(menu).getByRole('menuitem', { name: /my downloads/i })).toHaveAttribute(
      'href',
      '/dashboard/downloads',
    )
    expect(within(menu).getByRole('menuitem', { name: /^wishlist/i })).toHaveAttribute(
      'href',
      '/dashboard/wishlist',
    )
    expect(within(menu).getByRole('menuitem', { name: /profile/i })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^register$/i })).not.toBeInTheDocument()
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
      discount_amount: '0.00',
      total: '59.98',
      item_count: 2,
      total_quantity: 3,
      coupon: null,
      items: [],
    })

    renderNavbar()

    expect(await screen.findByLabelText('3 items in cart')).toHaveTextContent('3')
  })

  it('shows a wishlist count badge when the customer has saved items', async () => {
    const user = userEvent.setup()
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

    const menu = await openAccountMenu(user)
    expect(await within(menu).findByLabelText('3 saved items')).toHaveTextContent('3')
  })

  it('shows Admin and Profile for administrators', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { ...testUser, role: 'Administrator', email: 'admin@example.com' },
      isAuthenticated: true,
    })

    renderNavbar()

    const menu = await openAccountMenu(user)
    expect(within(menu).getByRole('menuitem', { name: /^admin$/i })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /profile/i })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /dashboard/i })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /my projects/i })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /my orders/i })).not.toBeInTheDocument()
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

    const menu = await openAccountMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: /sign out/i }))

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    })
    expect(screen.getByText('Home page')).toBeInTheDocument()
    expect(screen.queryByText('Sign in page')).not.toBeInTheDocument()
    expect(authApi.logoutUser).toHaveBeenCalledWith('refresh-token')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })
})
