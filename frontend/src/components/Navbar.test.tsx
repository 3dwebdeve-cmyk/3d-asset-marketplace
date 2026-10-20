import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '../api/authApi'
import * as cartApi from '../api/cartApi'
import * as categoriesApi from '../api/categoriesApi'
import * as pluginsApi from '../api/pluginsApi'
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

vi.mock('../api/categoriesApi', async () => {
  const actual = await vi.importActual<typeof import('../api/categoriesApi')>(
    '../api/categoriesApi',
  )
  return {
    ...actual,
    listPublicCategories: vi.fn(),
    recordCategoryClick: vi.fn().mockResolvedValue({ id: 'x', click_count: 1 }),
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
          <Route path="/home" element={<div>Marketplace home</div>} />
          <Route path="/login" element={<div>Sign in page</div>} />
          <Route path="/products" element={<div>Products page</div>} />
          <Route path="/3d-models" element={<div>3D Models page</div>} />
          <Route path="/plugins" element={<div>Plugins page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Dashboard page</div>} />
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
  const firstName = testUser.full_name.trim().split(/\s+/)[0]
  await user.click(screen.getByRole('button', { name: firstName }))
  return screen.getByRole('menu')
}

beforeEach(() => {
  resetAuthStore()
  resetAuthUiStore()
  vi.clearAllMocks()
  vi.mocked(cartApi.getCart).mockResolvedValue({
    id: 'cart-id',
    currency: 'USD',
    subtotal: '0.00',
    discount_amount: '0.00',
    total: '0.00',
    item_count: 0,
    total_quantity: 0,
    items: [],
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
  it.each([false, true])('filters the category picker and supports keyboard selection (compact: %s)', async (compact) => {
    const user = userEvent.setup()
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: compact && query.includes('max-width: 1200px'),
      media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }))
    vi.mocked(categoriesApi.listPublicCategories).mockResolvedValue({
      count: 2, next: null, previous: null,
      results: ['Furniture', 'Electronics'].map((name) => ({
        id: name.toLowerCase(), name, slug: name.toLowerCase(),
        description: '', image: '', parent: null, created_at: '2026-09-08T00:00:00Z',
      })),
    })
    try {
      renderNavbar('/3d-models')
      await user.click(screen.getByRole('button', { name: /^all categories$/i }))
      await screen.findByRole('menuitem', { name: 'Furniture' })
      const search = screen.getByRole('searchbox', { name: 'Search categories' })
      await user.type(search, 'eLeC')
      expect(screen.queryByRole('menuitem', { name: 'Furniture' })).not.toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Electronics' })).toBeInTheDocument()
      await user.keyboard('{Enter}')
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/3d-models$/)
      await user.keyboard('{ArrowDown}')
      expect(screen.getByRole('menuitem', { name: 'Electronics' })).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(screen.getByTestId('location')).toHaveTextContent('/3d-models?category=electronics')

      const trigger = screen.getByRole('button', { name: compact ? /^electronics$/i : /^all categories$/i })
      await user.click(trigger)
      const reopenedSearch = screen.getByRole('searchbox', { name: 'Search categories' })
      expect(reopenedSearch).toHaveValue('')
      await user.type(reopenedSearch, 'no matching category')
      expect(screen.getByRole('status')).toHaveTextContent('No categories found')
      await user.click(screen.getByRole('button', { name: 'Close categories' }))
      expect(screen.queryByRole('searchbox', { name: 'Search categories' })).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })

  it('uses the white marketplace header and existing categories on home', async () => {
    const user = userEvent.setup()
    const categoryId = '44bba207-8a0c-490d-abdf-5a383ed2111b'
    vi.mocked(categoriesApi.listPublicCategories).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: categoryId,
          name: 'Furniture',
          slug: 'furniture',
          description: '',
          image: '',
          parent: null,
          created_at: '2026-09-08T00:00:00Z',
        },
      ],
    })

    renderNavbar('/')

    expect(document.querySelector('.navbar')).toHaveClass('navbar--marketplace-home')
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /for business/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^home$/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /^3d model$/i })).toHaveAttribute(
      'href',
      '/3d-models',
    )
    expect(screen.getByRole('link', { name: /^custom projects$/i })).toHaveAttribute(
      'href',
      '/custom-projects',
    )
    expect(screen.getByRole('button', { name: /^log\s*in$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sign\s*up$/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^messages$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^account$/i })).not.toBeInTheDocument()

    await user.hover(screen.getByRole('button', { name: /^explore$/i }))
    expect(await screen.findByRole('menu', { name: /explore categories/i })).toBeInTheDocument()
    await user.click(
      await screen.findByRole('menuitem', { name: /furniture/i }),
    )

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/3d-models?category=${categoryId}`,
    )
  })

  it('hides Demo Assets from the Explore categories menu', async () => {
    const user = userEvent.setup()
    vi.mocked(categoriesApi.listPublicCategories).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 'demo-assets-id',
        name: 'Demo Assets',
        slug: 'demo-assets',
        description: '',
        image: '',
        parent: null,
        created_at: '2026-09-08T00:00:00Z',
      }],
    })

    renderNavbar('/home')
    await user.hover(screen.getByRole('button', { name: /^explore$/i }))
    const menu = await screen.findByRole('menu', { name: /explore categories/i })

    expect(within(menu).queryByRole('menuitem', { name: /demo assets/i })).not.toBeInTheDocument()
  })

  it('shows Login and Sign Up when logged out', () => {
    renderNavbar('/about')

    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^about$/i })).toHaveAttribute('href', '/about')
    expect(screen.getByRole('link', { name: /^contact$/i })).toHaveAttribute('href', '/contact')
    expect(screen.getByRole('link', { name: /^custom projects$/i })).toHaveAttribute(
      'href',
      '/custom-projects',
    )
    expect(screen.getByRole('link', { name: /^home$/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /^3d models$/i })).toHaveAttribute('href', '/3d-models')
    expect(screen.getByRole('link', { name: /^plugins$/i })).toHaveAttribute('href', '/plugins')
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })

  it.each([
    ['/3d-models', /^3d models$/i],
    ['/plugins', /^plugins$/i],
    ['/custom-projects', /^custom projects$/i],
    ['/about', /^about$/i],
    ['/contact', /^contact$/i],
  ])('marks the matching navbar link active on %s', (path, linkName) => {
    renderNavbar(path as string)
    const activeLink = screen.getByRole('link', { name: linkName as RegExp })

    expect(activeLink).toHaveClass('navbar__link--active')
    expect(activeLink).toHaveAttribute('aria-current', 'page')
    expect(document.querySelectorAll('.navbar__primary-links .navbar__link--active')).toHaveLength(1)
  })

  it('marks the Home navbar link active on the Home page', () => {
    renderNavbar('/')

    expect(screen.getByRole('link', { name: /^home$/i })).toHaveClass('navbar__link--active')
    expect(screen.getByRole('link', { name: /^home$/i })).toHaveAttribute('aria-current', 'page')
    expect(document.querySelectorAll('.navbar__primary-links .navbar__link--active')).toHaveLength(1)
  })

  it('shows user menu with Dashboard, Profile, and Sign out when logged in', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      accessToken: 'access-token',
      user: { ...testUser, avatar: 'https://cdn.example.com/avatar.jpg' },
      isAuthenticated: true,
    })

    renderNavbar()

    const firstName = testUser.full_name.trim().split(/\s+/)[0]
    expect(screen.getByText(firstName)).toBeInTheDocument()
    expect(screen.getByTestId('customer-account-trigger')).toHaveAccessibleName(firstName)
    expect(document.querySelector('.navbar__account-avatar')).toHaveAttribute(
      'src',
      'https://cdn.example.com/avatar.jpg',
    )
    expect(screen.getByRole('button', { name: /^cart$/i })).toBeInTheDocument()

    const menu = await openAccountMenu(user)
    expect(within(menu).getByText(testUser.full_name)).toBeInTheDocument()
    expect(within(menu).getByText(testUser.email)).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /dashboard/i })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /profile/i })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /my projects/i })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /my orders/i })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /my downloads/i })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /^wishlist/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /login/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign up/i })).not.toBeInTheDocument()
  })

  it('shows a cart count badge when the customer has items in cart', async () => {
    useAuthStore.setState({
      accessToken: 'access-token',
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
      items: [],
    })

    renderNavbar()

    expect(await screen.findByLabelText('3 items in cart')).toHaveTextContent('3')
  })

  it('shows Admin and Profile for administrators', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({
      accessToken: 'access-token',
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
    expect(authApi.logoutUser).toHaveBeenCalledWith()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(screen.getByRole('button', { name: /^log\s*in$/i })).toBeInTheDocument()
  })

  it('renders mobile drawer with LOGIN, SIGN UP, Menu dropdown headings, and Explore dropdown', async () => {
    const user = userEvent.setup()
    const origMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width: 1200px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    renderNavbar('/home')

    const menuButton = screen.getByRole('button', { name: /open menu/i })
    await user.click(menuButton)

    // The drawer should display LOGIN and SIGN UP at the top
    expect(screen.getByRole('button', { name: /^login$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sign up$/i })).toBeInTheDocument()

    // Menu accordion trigger button should be present
    expect(screen.getByRole('button', { name: /^menu$/i })).toBeInTheDocument()

    // Menu headings should be present
    expect(screen.getByRole('link', { name: /^home$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^3d model$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^plugin$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^custom project$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^about$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^contact$/i })).toBeInTheDocument()

    // Explore dropdown trigger button should be present
    const exploreTrigger = screen.getByRole('button', { name: /^explore$/i })
    expect(exploreTrigger).toBeInTheDocument()

    // Open Explore dropdown
    await user.click(exploreTrigger)
    expect(screen.getByRole('button', { name: /^all categories$/i })).toBeInTheDocument()

    window.matchMedia = origMatchMedia
  })

  it('navigates and filters immediately when selecting a category or All Categories from the search category dropdown', async () => {
    const user = userEvent.setup()
    const categoryId = 'arch-cat-123'
    vi.mocked(categoriesApi.listPublicCategories).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: categoryId,
          name: 'Architectural 3D Models',
          slug: 'architectural-3d-models',
          description: '',
          image: '',
          parent: null,
          created_at: '2026-09-08T00:00:00Z',
        },
      ],
    })

    renderNavbar('/3d-models')

    // Open the category dropdown in search bar
    const categorySelectBtn = screen.getByRole('button', { name: /^all categories$/i })
    await user.click(categorySelectBtn)

    // Click the Architectural 3D Models category
    const catItem = await screen.findByRole('menuitem', { name: /architectural 3d models/i })
    await user.click(catItem)

    expect(screen.getByTestId('location')).toHaveTextContent(`/3d-models?category=${categoryId}`)

    // Open dropdown again and click "All Categories"
    await user.click(screen.getByRole('button', { name: /^all categories$/i }))

    const allCatItem = await screen.findByRole('menuitem', { name: /^all categories$/i })
    await user.click(allCatItem)

    expect(screen.getByTestId('location')).toHaveTextContent('/3d-models')
  })

  it('uses the 3D model category menu on the Plugins page', async () => {
    const user = userEvent.setup()
    const categoryId = 'furniture-cat-123'
    vi.mocked(categoriesApi.listPublicCategories).mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: categoryId,
          name: 'Furniture',
          slug: 'furniture',
          description: '',
          image: '',
          parent: null,
          created_at: '2026-09-08T00:00:00Z',
        },
      ],
    })

    renderNavbar('/plugins')

    await user.click(screen.getByRole('button', { name: /^all categories$/i }))
    const furnitureItem = await screen.findByRole('menuitem', { name: /furniture/i })
    await user.click(furnitureItem)

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/3d-models?category=${categoryId}`,
    )
    expect(pluginsApi.listPublicPluginCategories).not.toHaveBeenCalled()
  })
})
