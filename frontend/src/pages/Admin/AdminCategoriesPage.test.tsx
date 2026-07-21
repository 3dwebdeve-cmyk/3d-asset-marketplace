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
      <MemoryRouter initialEntries={['/admin/categories']}>
        <Routes>
          <Route path="/admin/categories" element={<AdminCategoriesPage />} />
          <Route path="/admin" element={<div>Admin Dashboard</div>} />
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
  it('renders category list', async () => {
    renderCategoriesPage()

    expect(screen.getByRole('heading', { name: /categories/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Furniture')).toBeInTheDocument()
    })
    expect(screen.getByText('furniture')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /manage/i })).toHaveAttribute(
      'href',
      '/admin/categories/44bba207-8a0c-490d-abdf-5a383ed2111b',
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
