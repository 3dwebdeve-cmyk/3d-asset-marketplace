import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as pluginsApi from '../../api/pluginsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminPluginCategoriesPage } from './AdminPluginCategoriesPage'

vi.mock('../../api/pluginsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/pluginsApi')>(
    '../../api/pluginsApi',
  )
  return {
    ...actual,
    listAdminPluginCategories: vi.fn(),
    createAdminPluginCategory: vi.fn(),
  }
})

const category = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Blender',
  slug: 'blender',
  description: '',
  image: '',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/console/plugin-categories']}>
        <Routes>
          <Route path="/console/plugin-categories" element={<AdminPluginCategoriesPage />} />
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
  vi.mocked(pluginsApi.listAdminPluginCategories).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [category],
  })
})

describe('AdminPluginCategoriesPage', () => {
  it('lists and filters plugin categories', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('Blender')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Filter plugin categories by status'), 'active')
    await waitFor(() => {
      expect(pluginsApi.listAdminPluginCategories).toHaveBeenLastCalledWith(
        expect.objectContaining({ is_active: true, page: 1 }),
      )
    })
  })

  it('validates and creates a plugin category', async () => {
    const user = userEvent.setup()
    vi.mocked(pluginsApi.createAdminPluginCategory).mockResolvedValue(category)
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Create plugin category' }))
    await user.type(screen.getByLabelText('Name'), 'A')
    await user.click(screen.getByRole('button', { name: 'Create plugin category' }))
    expect(await screen.findByText('Name must be at least 2 characters.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Name'), 'dd-ons')
    await user.click(screen.getByRole('button', { name: 'Create plugin category' }))
    await waitFor(() => {
      expect(pluginsApi.createAdminPluginCategory).toHaveBeenCalled()
    })
    expect(vi.mocked(pluginsApi.createAdminPluginCategory).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ name: 'Add-ons' }),
    )
    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument()
  })
})
