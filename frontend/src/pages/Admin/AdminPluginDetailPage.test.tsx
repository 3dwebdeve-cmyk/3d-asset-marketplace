import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as pluginsApi from '../../api/pluginsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { AdminPluginDetailPage } from './AdminPluginDetailPage'

vi.mock('../../api/pluginsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/pluginsApi')>(
    '../../api/pluginsApi',
  )
  return {
    ...actual,
    getAdminPlugin: vi.fn(),
    listAdminPluginCategories: vi.fn(),
    listAllAdminPluginCategories: vi.fn(),
    updateAdminPlugin: vi.fn(),
    archiveAdminPlugin: vi.fn(),
    uploadPluginFile: vi.fn(),
  }
})

const pluginId = '11111111-1111-1111-1111-111111111111'
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
  documentation_url: 'https://example.com/docs',
  license_type: 'commercial' as const,
  average_rating: '0.00',
      review_count: 0,
  total_downloads: 0,
  status: 'draft' as const,
  category,
  images: [],
  files: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function renderPage(initialPluginId = pluginId) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[`/admin/plugins/${initialPluginId}`]}>
        <Routes>
          <Route path="/admin/plugins/:pluginId" element={<AdminPluginDetailPage />} />
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
  vi.mocked(pluginsApi.getAdminPlugin).mockResolvedValue(plugin)
  vi.mocked(pluginsApi.listAdminPluginCategories).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [category],
  })
  vi.mocked(pluginsApi.listAllAdminPluginCategories).mockResolvedValue([category])
})

describe('AdminPluginDetailPage', () => {
  it('loads plugin fields and media states', async () => {
    renderPage()
    expect(await screen.findByDisplayValue('Mesh Toolkit')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Blender 4.x')).toBeInTheDocument()
    expect(screen.getByText('Images and plugin packages')).toBeInTheDocument()
    expect(screen.getByText('No plugin packages uploaded yet.')).toBeInTheDocument()
  })

  it('validates pricing and saves valid changes', async () => {
    const user = userEvent.setup()
    vi.mocked(pluginsApi.updateAdminPlugin).mockResolvedValue({
      ...plugin,
      status: 'published',
    })
    renderPage()
    await screen.findByDisplayValue('Mesh Toolkit')

    await user.type(screen.getByLabelText('Discount price'), '30')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Discount price cannot exceed price.')).toBeInTheDocument()
    expect(pluginsApi.updateAdminPlugin).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Discount price'))
    await user.selectOptions(screen.getByLabelText('Status'), 'published')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(pluginsApi.updateAdminPlugin).toHaveBeenCalledWith(
        pluginId,
        expect.objectContaining({
          status: 'published',
          discount_price: null,
          slug: 'mesh-toolkit',
        }),
      )
    })
    expect(vi.mocked(pluginsApi.updateAdminPlugin).mock.calls[0]?.[1]).not.toHaveProperty(
      'thumbnail',
    )
    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument()
  })

  it('preserves unsaved edits when media refreshes plugin data', async () => {
    const user = userEvent.setup()
    vi.mocked(pluginsApi.uploadPluginFile).mockResolvedValue({
      id: '44444444-4444-4444-4444-444444444444',
      file_name: 'plugin.zip',
      file_format: 'zip',
      file_size: 4,
      version: '2.1',
      is_primary: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    renderPage()
    const name = await screen.findByDisplayValue('Mesh Toolkit')
    await user.clear(name)
    await user.type(name, 'Unsaved Plugin Name')

    const packageInput = document.getElementById(
      'plugin-package-upload',
    ) as HTMLInputElement
    await user.upload(
      packageInput,
      new File(['PK\u0003\u0004'], 'plugin.zip', { type: 'application/zip' }),
    )

    await waitFor(() => {
      expect(pluginsApi.getAdminPlugin).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByDisplayValue('Unsaved Plugin Name')).toBeInTheDocument()
  })

  it('archives a plugin and redirects to admin', async () => {
    const user = userEvent.setup()
    vi.mocked(pluginsApi.archiveAdminPlugin).mockResolvedValue({
      ...plugin,
      status: 'archived',
    })
    renderPage()
    await screen.findByDisplayValue('Mesh Toolkit')
    await user.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => {
      expect(pluginsApi.archiveAdminPlugin).toHaveBeenCalledWith(pluginId)
    })
    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument()
  })

  it('rehydrates form fields when navigating to another plugin', async () => {
    const user = userEvent.setup()
    const otherPluginId = '55555555-5555-5555-5555-555555555555'
    const otherPlugin = {
      ...plugin,
      id: otherPluginId,
      name: 'UV Packer',
      slug: 'uv-packer',
      version: '1.0',
      compatibility: 'Maya 2024',
    }
    vi.mocked(pluginsApi.getAdminPlugin).mockImplementation(async (id: string) => {
      if (id === otherPluginId) return otherPlugin
      return plugin
    })
    vi.mocked(pluginsApi.updateAdminPlugin).mockResolvedValue(otherPlugin)

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={[`/admin/plugins/${pluginId}`]}>
          <Routes>
            <Route
              path="/admin/plugins/:pluginId"
              element={
                <>
                  <AdminPluginDetailPage />
                  <Link to={`/admin/plugins/${otherPluginId}`}>Next plugin</Link>
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByDisplayValue('Mesh Toolkit')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Next plugin' }))

    expect(await screen.findByDisplayValue('UV Packer')).toBeInTheDocument()
    expect(screen.getByLabelText('Version')).toHaveValue('1.0')
    expect(screen.getByLabelText('Package version')).toHaveValue('1.0')
    expect(screen.queryByDisplayValue('Mesh Toolkit')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(pluginsApi.updateAdminPlugin).toHaveBeenCalledWith(
        otherPluginId,
        expect.objectContaining({
          name: 'UV Packer',
          version: '1.0',
        }),
      )
    })
  })
})
