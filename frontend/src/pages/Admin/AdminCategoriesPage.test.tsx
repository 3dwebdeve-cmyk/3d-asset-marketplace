import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as categoriesApi from '../../api/categoriesApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminCategoriesPage } from './AdminCategoriesPage'

vi.mock('../../api/categoriesApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/categoriesApi')>(
    '../../api/categoriesApi',
  )
  return {
    ...actual,
    listAdminCategories: vi.fn(),
    createAdminCategory: vi.fn(),
  }
})

const sampleCategories = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: '44bba207-8a0c-490d-abdf-5a383ed2111b',
      name: 'Furniture',
      slug: 'furniture',
      description: 'Furniture models',
      image: '',
      parent: null,
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ],
}

function renderCategoriesPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/console/categories']}>
        <Routes>
          <Route path="/console/categories" element={<AdminCategoriesPage />} />
          <Route path="/console" element={<div>Admin Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  vi.mocked(categoriesApi.listAdminCategories).mockResolvedValue(sampleCategories)
})

describe('AdminCategoriesPage', () => {
  it('paginates categories and resets the page when searching', async () => {
    vi.mocked(categoriesApi.listAdminCategories).mockImplementation(async (params) => ({
      ...sampleCategories,
      count: 18,
      next: null,
      results: params?.page === 2
        ? [{ ...sampleCategories.results[0], name: 'Electronics' }]
        : sampleCategories.results,
    }))
    const user = userEvent.setup()
    renderCategoriesPage()
    await screen.findByText('Furniture')
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await screen.findByText('Electronics')
    expect(categoriesApi.listAdminCategories).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, page_size: 10 }),
    )
    await user.type(screen.getByLabelText('Search categories'), 'chair')
    await waitFor(() => expect(categoriesApi.listAdminCategories).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'chair', page: 1 }),
    ))
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  })

  it('switches views and opens hierarchy links', async () => {
    const user = userEvent.setup()
    renderCategoriesPage()
    await screen.findByText('Furniture')
    await user.click(screen.getByRole('button', { name: 'Grid view' }))
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Manage hierarchy' }))
    expect(screen.getByRole('region', { name: 'Category hierarchy' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Furniture' })).toHaveAttribute(
      'href', `/console/categories/${sampleCategories.results[0].id}`,
    )
  })

  it('renders category list', async () => {
    renderCategoriesPage()

    expect(screen.getByRole('heading', { name: /categories/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Furniture')).toBeInTheDocument()
    })
    expect(screen.getByText('furniture')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /manage/i })).toHaveAttribute(
      'href',
      '/console/categories/44bba207-8a0c-490d-abdf-5a383ed2111b',
    )
  })

  it('creates a category from the inline form', async () => {
    const user = userEvent.setup()
    vi.mocked(categoriesApi.createAdminCategory).mockResolvedValue(sampleCategories.results[0])

    renderCategoriesPage()

    await user.click(screen.getByRole('button', { name: /create category/i }))
    await user.type(screen.getByLabelText(/^name$/i), 'Architecture')
    await user.click(screen.getByRole('button', { name: /^create category$/i }))

    await waitFor(() => {
      expect(categoriesApi.createAdminCategory).toHaveBeenCalled()
    })
    expect(vi.mocked(categoriesApi.createAdminCategory).mock.calls[0]?.[0]).toMatchObject({
      name: 'Architecture',
    })
    await waitFor(() => {
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
    })
  })
})
