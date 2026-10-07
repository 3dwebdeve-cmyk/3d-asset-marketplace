import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as pluginsApi from '../../api/pluginsApi'
import { createTestQueryClient } from '../../test/test-utils'
import { PluginsBrowsePage } from './PluginsBrowsePage'

vi.mock('../../api/pluginsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/pluginsApi')>('../../api/pluginsApi')
  return {
    ...actual,
    listPublicPlugins: vi.fn(),
    listPublicPluginCategories: vi.fn(),
    getPublicPlugin: vi.fn(),
  }
})

const categoryId = '11aab317-9a1c-401e-acdf-5b373ed3222c'
const pluginId = 'a2e77f31-f244-4607-b7d6-b58e3ff6de11'

const samplePublicPlugins = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: pluginId,
      name: 'Blender Auto-Rig Pro',
      slug: 'blender-auto-rig-pro',
      short_description: 'Auto rigging plugin for Blender',
      price: '29.99',
      currency: 'USD',
      discount_price: '19.99',
      thumbnail: '',
      version: '2.1',
      compatibility: 'Blender 4.x',
      license_type: 'standard' as const,
      average_rating: '4.90',
      review_count: 0,
      total_downloads: 340,
      category: {
        id: categoryId,
        name: 'Rigging Tools',
        slug: 'rigging-tools',
        description: '',
        image: '',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
}

const samplePluginCategories = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: categoryId,
      name: 'Rigging Tools',
      slug: 'rigging-tools',
      description: 'Animation rigging utilities',
      image: '',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
}

function renderPluginsBrowsePage(initialPath = '/plugins') {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/plugins" element={<PluginsBrowsePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(pluginsApi.listPublicPlugins).mockResolvedValue(samplePublicPlugins)
  vi.mocked(pluginsApi.listPublicPluginCategories).mockResolvedValue(samplePluginCategories)
  vi.mocked(pluginsApi.getPublicPlugin).mockImplementation(async () => ({
    ...samplePublicPlugins.results[0],
    description: '',
    documentation_url: '',
    images: [],
    files: [{
      id: 'file-1',
      file_name: 'rig.blend',
      file_format: 'blend',
      file_size: 100,
      version: '1',
      is_primary: true,
    }],
    updated_at: '2026-01-01T00:00:00Z',
  }))
})

describe('PluginsBrowsePage', () => {
  it('labels the plugin results section', () => {
    renderPluginsBrowsePage()

    expect(screen.getByText('Plugin', { selector: '.plugins-browse-toolbar__count' })).toBeInTheDocument()
  })

  it('renders hero title and plugin list', async () => {
    renderPluginsBrowsePage()

    expect(screen.getByRole('heading', { name: /^plugins$/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Blender Auto-Rig Pro')).toBeInTheDocument()
    })

    expect(screen.getAllByText('Rigging Tools').length).toBeGreaterThan(0)
    expect(screen.getByText('$19.99')).toBeInTheDocument()
    expect(screen.getByText('$29.99')).toBeInTheDocument()
  })

  it('filters plugins by category selection', async () => {
    const user = userEvent.setup()
    renderPluginsBrowsePage()

    await waitFor(() => {
      expect(screen.getByText('Blender Auto-Rig Pro')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText(/category/i), categoryId)

    await waitFor(() => {
      expect(pluginsApi.listPublicPlugins).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: categoryId }),
      )
    })
  })

  it('applies category filter from URL query string', async () => {
    renderPluginsBrowsePage(`/plugins?category=${encodeURIComponent(categoryId)}`)

    await waitFor(() => {
      expect(pluginsApi.listPublicPlugins).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: categoryId }),
      )
    })

    await waitFor(() => {
      expect(screen.getByLabelText(/^category$/i)).toHaveValue(categoryId)
    })
  })

  it('sorts plugins by price low to high', async () => {
    const user = userEvent.setup()
    renderPluginsBrowsePage()

    await waitFor(() => {
      expect(screen.getByText('Blender Auto-Rig Pro')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText(/sort by/i), 'price')

    await waitFor(() => {
      expect(pluginsApi.listPublicPlugins).toHaveBeenCalledWith(
        expect.objectContaining({ ordering: 'price' }),
      )
    })
  })

  it('shows empty state when no plugins match filters', async () => {
    vi.mocked(pluginsApi.listPublicPlugins).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    renderPluginsBrowsePage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /no plugins found/i })).toBeInTheDocument()
    })
  })

  it('shows error state and retry button on API failure', async () => {
    vi.mocked(pluginsApi.listPublicPlugins).mockRejectedValue(new Error('Network error'))

    renderPluginsBrowsePage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /failed to load plugins/i })).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('shows clear filters button when filters are active', async () => {
    vi.mocked(pluginsApi.listPublicPlugins).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })

    renderPluginsBrowsePage(`/plugins?category=${encodeURIComponent(categoryId)}`)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /no plugins found/i })).toBeInTheDocument()
    })

    expect(screen.getAllByRole('button', { name: /clear filters/i }).length).toBeGreaterThan(0)
  })

  it('filters by file format, price, and license, then clears filters', async () => {
    const user = userEvent.setup()
    const blenderPlugin = samplePublicPlugins.results[0]
    const unityPlugin = {
      ...blenderPlugin,
      id: 'unity-plugin',
      name: 'Unity Terrain Tools',
      slug: 'unity-terrain-tools',
      price: '120.00',
      discount_price: null,
      license_type: 'extended' as const,
    }
    vi.mocked(pluginsApi.listPublicPlugins).mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [blenderPlugin, unityPlugin],
    })
    vi.mocked(pluginsApi.getPublicPlugin).mockImplementation(async (slug) => ({
      ...(slug === unityPlugin.slug ? unityPlugin : blenderPlugin),
      description: '',
      documentation_url: '',
      images: [],
      files: [{
        id: `file-${slug}`,
        file_name: slug === unityPlugin.slug ? 'terrain.unitypackage' : 'rig.blend',
        file_format: slug === unityPlugin.slug ? 'unitypackage' : 'blend',
        file_size: 100,
        version: '1',
        is_primary: true,
      }],
      updated_at: '2026-01-01T00:00:00Z',
    }))

    renderPluginsBrowsePage()
    await screen.findByText('Unity Terrain Tools')
    expect(screen.getByText('Blender Auto-Rig Pro')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /blender \(\.blend\)/i }))
    expect(screen.getByText('Blender Auto-Rig Pro')).toBeInTheDocument()
    expect(screen.queryByText('Unity Terrain Tools')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(screen.getByText('Unity Terrain Tools')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /extended license/i }))
    expect(screen.queryByText('Blender Auto-Rig Pro')).not.toBeInTheDocument()
    expect(screen.getByText('Unity Terrain Tools')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    fireEvent.change(screen.getByRole('slider', { name: /maximum price/i }), {
      target: { value: '50' },
    })
    expect(screen.getByText('Blender Auto-Rig Pro')).toBeInTheDocument()
    expect(screen.queryByText('Unity Terrain Tools')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(screen.getByRole('slider', { name: /maximum price/i })).toHaveValue('200')
    expect(screen.getByText('Unity Terrain Tools')).toBeInTheDocument()
  })
})
