import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as pluginsApi from '../../api/pluginsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminPluginsPage } from './AdminPluginsPage'

vi.mock('../../api/pluginsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/pluginsApi')>(
    '../../api/pluginsApi',
  )
  return {
    ...actual,
    listAdminPlugins: vi.fn(),
    listAdminPluginCategories: vi.fn(),
    listAllAdminPluginCategories: vi.fn(),
    createAdminPlugin: vi.fn(),
  }
})

const pluginId = '11111111-1111-1111-1111-111111111111'
const categoryId = '22222222-2222-2222-2222-222222222222'
const category = {
  id: categoryId,
  name: 'Blender',
  slug: 'blender',
  description: '',
  image: '',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}
const plugin = {
  id: pluginId,
  name: 'Mesh Toolkit',
  slug: 'mesh-toolkit',
  description: 'Editing tools',
  short_description: 'Faster mesh editing',
  price: '24.00',
  currency: 'USD',
  discount_price: null,
  thumbnail: '',
  version: '2.1',
  compatibility: 'Blender 4.x',
  documentation_url: '',
  license_type: 'commercial' as const,
  average_rating: '0.00',
      review_count: 0,
  total_downloads: 0,
  status: 'published' as const,
  category,
  images: [],
  files: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/admin/plugins']}>
        <Routes>
          <Route path="/admin/plugins" element={<AdminPluginsPage />} />
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
  vi.mocked(pluginsApi.listAdminPlugins).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [plugin],
  })
  vi.mocked(pluginsApi.listAdminPluginCategories).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [category],
  })
  vi.mocked(pluginsApi.listAllAdminPluginCategories).mockResolvedValue([category])
})

describe('AdminPluginsPage', () => {
  it('lists plugins and applies category, status, and ordering filters', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('Mesh Toolkit')).toBeInTheDocument()
    expect(screen.getAllByText('Blender').length).toBeGreaterThanOrEqual(1)

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'published')
    await user.selectOptions(screen.getByLabelText('Filter by category'), categoryId)
    await user.selectOptions(screen.getByLabelText('Order plugins'), 'price')

    await waitFor(() => {
      expect(pluginsApi.listAdminPlugins).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'published',
          category_id: categoryId,
          ordering: 'price',
        }),
      )
    })
  })

  it('validates and creates a plugin before redirecting to admin', async () => {
    const user = userEvent.setup()
    vi.mocked(pluginsApi.createAdminPlugin).mockResolvedValue(plugin)
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Create plugin' }))
    await user.click(screen.getByRole('button', { name: 'Create plugin' }))
    expect(await screen.findByText('Select a plugin category.')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Category'), categoryId)
    await user.type(screen.getByLabelText('Name'), 'Render Tools')
    await user.type(screen.getByLabelText('Price (USD)'), '15')
    await user.click(screen.getByRole('button', { name: 'Create plugin' }))

    await waitFor(() => {
      expect(pluginsApi.createAdminPlugin).toHaveBeenCalled()
    })
    expect(vi.mocked(pluginsApi.createAdminPlugin).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ name: 'Render Tools', price: '15.00' }),
    )
    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument()
  })
})
