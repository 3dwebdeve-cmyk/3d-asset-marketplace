import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as pluginsApi from '../../api/pluginsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { PluginMediaSection } from './PluginMediaSection'

vi.mock('../../api/pluginsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/pluginsApi')>(
    '../../api/pluginsApi',
  )
  return {
    ...actual,
    uploadPluginImage: vi.fn(),
    deletePluginImage: vi.fn(),
    uploadPluginFile: vi.fn(),
    deletePluginFile: vi.fn(),
  }
})

const pluginId = '11111111-1111-1111-1111-111111111111'
const plugin = {
  id: pluginId,
  name: 'Mesh Toolkit',
  slug: 'mesh-toolkit',
  description: '',
  short_description: '',
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
  status: 'draft' as const,
  category: {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Blender',
    slug: 'blender',
    description: '',
    image: '',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  images: [{
    id: '33333333-3333-3333-3333-333333333333',
    image_url: 'https://example.com/plugin.webp',
    display_order: 0,
    is_primary: true,
    created_at: '2026-01-01T00:00:00Z',
  }],
  files: [{
    id: '44444444-4444-4444-4444-444444444444',
    file_name: 'mesh-toolkit.zip',
    file_format: 'zip',
    file_size: 2048,
    version: '2.1',
    is_primary: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function renderSection() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <PluginMediaSection pluginId={pluginId} plugin={plugin} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
})

describe('PluginMediaSection', () => {
  it('shows supported media and uploaded package details', () => {
    renderSection()
    expect(screen.getAllByText('ZIP').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('RAR')).toBeInTheDocument()
    expect(screen.getByText('Primary image')).toBeInTheDocument()
    expect(screen.getByText('mesh-toolkit.zip')).toBeInTheDocument()
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument()
    expect(document.getElementById('plugin-package-upload')).toHaveAttribute(
      'accept',
      expect.stringContaining('.7z'),
    )
  })

  it('rejects an unsupported package before upload', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderSection()
    const input = document.getElementById('plugin-package-upload') as HTMLInputElement
    await user.upload(input, new File(['unsafe'], 'plugin.exe', { type: 'application/octet-stream' }))
    expect(await screen.findByText(/Allowed formats/)).toBeInTheDocument()
    expect(pluginsApi.uploadPluginFile).not.toHaveBeenCalled()
  })

  it('uploads and deletes plugin packages', async () => {
    const user = userEvent.setup()
    vi.mocked(pluginsApi.uploadPluginFile).mockResolvedValue(plugin.files[0])
    vi.mocked(pluginsApi.deletePluginFile).mockResolvedValue()
    renderSection()

    const input = document.getElementById('plugin-package-upload') as HTMLInputElement
    const file = new File(['PK\u0003\u0004'], 'plugin.zip', { type: 'application/zip' })
    await user.upload(input, file)
    await waitFor(() => {
      expect(pluginsApi.uploadPluginFile).toHaveBeenCalledWith(
        pluginId,
        expect.objectContaining({ file, version: '2.1', is_primary: true }),
      )
    })
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1])
    await waitFor(() => {
      expect(pluginsApi.deletePluginFile).toHaveBeenCalledWith(
        pluginId,
        plugin.files[0].id,
      )
    })
  })

  it('resets package version when switching to another plugin', async () => {
    const user = userEvent.setup()
    const otherPluginId = '55555555-5555-5555-5555-555555555555'
    const otherPlugin = {
      ...plugin,
      id: otherPluginId,
      version: '9.9',
      images: [],
      files: [],
    }
    vi.mocked(pluginsApi.uploadPluginFile).mockResolvedValue({
      id: '66666666-6666-6666-6666-666666666666',
      file_name: 'other.zip',
      file_format: 'zip',
      file_size: 4,
      version: '9.9',
      is_primary: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })

    const { rerender } = render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PluginMediaSection pluginId={pluginId} plugin={plugin} />
      </QueryClientProvider>,
    )

    expect(screen.getByDisplayValue('2.1')).toBeInTheDocument()
    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <PluginMediaSection pluginId={otherPluginId} plugin={otherPlugin} />
      </QueryClientProvider>,
    )
    expect(screen.getByDisplayValue('9.9')).toBeInTheDocument()

    const input = document.getElementById('plugin-package-upload') as HTMLInputElement
    const file = new File(['PK\u0003\u0004'], 'other.zip', { type: 'application/zip' })
    await user.upload(input, file)
    await waitFor(() => {
      expect(pluginsApi.uploadPluginFile).toHaveBeenCalledWith(
        otherPluginId,
        expect.objectContaining({ version: '9.9' }),
      )
    })
  })
})
