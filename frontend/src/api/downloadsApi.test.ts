import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from './client'
import {
  buildCatalogDownloadPath,
  downloadCatalogFile,
  listAdminDownloadHistory,
  listDownloadEntitlements,
  listDownloadHistory,
} from './downloadsApi'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('downloadsApi', () => {
  it('lists entitlements', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] })
    await listDownloadEntitlements()
    expect(apiClient.get).toHaveBeenCalledWith('/api/downloads/entitlements/')
  })

  it('lists customer history with query params', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })
    await listDownloadHistory({ page: 2, page_size: 10 })
    expect(apiClient.get).toHaveBeenCalledWith('/api/downloads/history/?page=2&page_size=10')
  })

  it('lists admin history with filters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })
    await listAdminDownloadHistory({
      user_email: 'buyer@example.com',
      product_type: 'product',
      ordering: '-downloaded_at',
    })
    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/admin/downloads/history/?user_email=buyer%40example.com&product_type=product&ordering=-downloaded_at',
    )
  })

  it('builds product and plugin download paths', () => {
    expect(buildCatalogDownloadPath('product', 'prod-id', 'file-id')).toBe(
      '/api/downloads/products/prod-id/files/file-id/download/',
    )
    expect(buildCatalogDownloadPath('plugin', 'plugin-id', 'file-id')).toBe(
      '/api/downloads/plugins/plugin-id/files/file-id/download/',
    )
  })

  it('downloads catalog files as blobs', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob(['zip']) })
    const click = vi.fn()
    const revokeObjectURL = vi.fn()
    const createObjectURL = vi.fn(() => 'blob:mock')
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    })
    const anchor = { click, href: '', download: '' } as unknown as HTMLAnchorElement
    vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    await downloadCatalogFile('product', 'prod-id', 'file-id', 'package.zip')

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/downloads/products/prod-id/files/file-id/download/',
      { responseType: 'blob' },
    )
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })
})
