import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as categoriesApi from '../../api/categoriesApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminCategoryDetailPage } from './AdminCategoryDetailPage'

vi.mock('../../api/categoriesApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/categoriesApi')>(
    '../../api/categoriesApi',
  )
  return {
    ...actual,
    getAdminCategory: vi.fn(),
    listAdminCategories: vi.fn(),
    updateAdminCategory: vi.fn(),
    deactivateAdminCategory: vi.fn(),
  }
})

const categoryId = '44bba207-8a0c-490d-abdf-5a383ed2111b'

const sampleCategory = {
  id: categoryId,
  name: 'Furniture',
  slug: 'furniture',
  description: 'Furniture models',
  image: '',
  parent: null,
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

function renderCategoryDetailPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/admin/categories/${categoryId}`]}>
        <Routes>
          <Route
            path="/admin/categories/:categoryId"
            element={<AdminCategoryDetailPage />}
          />
          <Route path="/admin/categories" element={<div>Categories list</div>} />
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
  vi.mocked(categoriesApi.getAdminCategory).mockResolvedValue(sampleCategory)
  vi.mocked(categoriesApi.listAdminCategories).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [sampleCategory],
  })
})

describe('AdminCategoryDetailPage', () => {
  it('loads category details into the form', async () => {
    renderCategoryDetailPage()

    await waitFor(() => {
      expect(screen.getByDisplayValue('Furniture')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('furniture')).toBeInTheDocument()
  })

  it('saves category updates', async () => {
    const user = userEvent.setup()
    vi.mocked(categoriesApi.updateAdminCategory).mockResolvedValue({
      ...sampleCategory,
      description: 'Updated description',
    })

    renderCategoryDetailPage()

    await waitFor(() => {
      expect(screen.getByDisplayValue('Furniture')).toBeInTheDocument()
    })

    const descriptionField = screen.getByLabelText(/description/i)
    await user.clear(descriptionField)
    await user.type(descriptionField, 'Updated description')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(categoriesApi.updateAdminCategory).toHaveBeenCalledWith(
        categoryId,
        expect.objectContaining({ description: 'Updated description' }),
      )
    })
    await waitFor(() => {
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
    })
  })
})
