import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as pluginsApi from '../../api/pluginsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminPluginCategoryDetailPage } from './AdminPluginCategoryDetailPage'

vi.mock('../../api/pluginsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/pluginsApi')>(
    '../../api/pluginsApi',
  )
  return {
    ...actual,
    getAdminPluginCategory: vi.fn(),
    updateAdminPluginCategory: vi.fn(),
    deactivateAdminPluginCategory: vi.fn(),
  }
})

const categoryId = '22222222-2222-2222-2222-222222222222'
const category = {
  id: categoryId,
  name: 'Blender',
  slug: 'blender',
  description: 'Blender add-ons',
  image: '',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[`/console/plugin-categories/${categoryId}`]}>
        <Routes>
          <Route
            path="/console/plugin-categories/:categoryId"
            element={<AdminPluginCategoryDetailPage />}
          />
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
  vi.mocked(pluginsApi.getAdminPluginCategory).mockResolvedValue(category)
})

describe('AdminPluginCategoryDetailPage', () => {
  it('loads and saves a plugin category', async () => {
    const user = userEvent.setup()
    vi.mocked(pluginsApi.updateAdminPluginCategory).mockResolvedValue({
      ...category,
      name: 'Blender Tools',
    })
    renderPage()
    const name = await screen.findByDisplayValue('Blender')
    await user.clear(name)
    await user.type(name, 'Blender Tools')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(pluginsApi.updateAdminPluginCategory).toHaveBeenCalledWith(
        categoryId,
        expect.objectContaining({ name: 'Blender Tools', slug: undefined }),
      )
    })
    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument()
  })

  it('deactivates a plugin category', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    vi.mocked(pluginsApi.deactivateAdminPluginCategory).mockResolvedValue({
      ...category,
      is_active: false,
    })
    renderPage()
    await screen.findByDisplayValue('Blender')
    await user.click(screen.getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => {
      expect(pluginsApi.deactivateAdminPluginCategory).toHaveBeenCalledWith(categoryId)
    })
    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument()
  })

  it('preserves unsaved edits when category data is refetched', async () => {
    const user = userEvent.setup()
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/console/plugin-categories/${categoryId}`]}>
          <Routes>
            <Route
              path="/console/plugin-categories/:categoryId"
              element={<AdminPluginCategoryDetailPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const name = await screen.findByDisplayValue('Blender')
    await user.clear(name)
    await user.type(name, 'Unsaved Category Name')

    queryClient.setQueryData(['admin', 'plugin-categories', categoryId], {
      ...category,
      name: 'Server Category Name',
      description: 'Changed on server',
    })

    await waitFor(() => {
      expect(screen.getByDisplayValue('Unsaved Category Name')).toBeInTheDocument()
    })
    expect(screen.queryByDisplayValue('Server Category Name')).not.toBeInTheDocument()
  })
})
