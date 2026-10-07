import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from './client'
import {
  buildCatalogDownloadPath,
  downloadCatalogFile,
  downloadCatalogFileByUrl,
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
  vi.restoreAllMocks()
})

describe('downloadsApi', () => {
  it('lists entitlements', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] })
    await listDownloadEntitlements()
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/downloads/entitlements/')
  })

  it('lists customer history with query params', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })
    await listDownloadHistory({ page: 2, page_size: 10 })
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/downloads/history/?page=2&page_size=10')
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
      '/api/v1/admin/downloads/history/?user_email=buyer%40example.com&product_type=product&ordering=-downloaded_at',
    )
  })

  it('builds product and plugin download paths', () => {
    expect(buildCatalogDownloadPath('product', 'prod-id', 'file-id')).toBe(
      '/api/v1/downloads/products/prod-id/files/file-id/download/',
    )
    expect(buildCatalogDownloadPath('plugin', 'plugin-id', 'file-id')).toBe(
      '/api/v1/downloads/plugins/plugin-id/files/file-id/download/',
    )
  })

  it('downloads catalog files as blobs', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: new Blob(['zip']),
      headers: { 'content-type': 'application/zip' },
    })
    const click = vi.fn()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const anchor = { click, href: '', download: '', rel: '', target: '' } as unknown as HTMLAnchorElement
    vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    await downloadCatalogFile('product', 'prod-id', 'file-id', 'package.zip')

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/downloads/products/prod-id/files/file-id/download/',
      { responseType: 'blob' },
    )
    expect(click).toHaveBeenCalled()
    expect(createObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('opens a signed JSON download_url without treating it as a blob', async () => {
    const signedUrl =
      'https://acc.r2.cloudflarestorage.com/3dam-private/products/files/pack.zip?X-Amz-Signature=abc'
    const payload = JSON.stringify({
      download_url: signedUrl,
      expires_in: 300,
      file_name: 'hero.zip',
    })
    vi.mocked(apiClient.get).mockResolvedValue({
      data: new Blob([payload], { type: 'application/json' }),
      headers: { 'content-type': 'application/json' },
    })
    const click = vi.fn()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    const anchor = {
      click,
      href: '',
      download: '',
      rel: '',
      target: '',
    } as unknown as HTMLAnchorElement
    vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    await downloadCatalogFile('product', 'prod-id', 'file-id', 'package.zip')

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(anchor.href).toBe(signedUrl)
    expect(anchor.download).toBe('hero.zip')
    expect(anchor.target).toBe('_blank')
    expect(click).toHaveBeenCalled()
  })

  it('requests only the downloads path from an absolute API link', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: new Blob(['glb']),
      headers: { 'content-type': 'model/gltf-binary' },
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const anchor = { click: vi.fn(), href: '', download: '', rel: '', target: '' } as unknown as HTMLAnchorElement
    vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    const absolute =
      'http://127.0.0.1:8000/api/v1/downloads/products/prod-id/files/file-id/download/'
    await downloadCatalogFileByUrl(absolute, 'tree.glb')

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/downloads/products/prod-id/files/file-id/download/',
      { responseType: 'blob' },
    )
  })

  it('rejects catalog download paths outside the downloads API', async () => {
    await expect(downloadCatalogFileByUrl('https://evil.example/steal', 'pack.zip')).rejects.toThrow(
      'Invalid download URL.',
    )
    await expect(
      downloadCatalogFileByUrl('/api/v1/downloads/../auth/logout/', 'pack.zip'),
    ).rejects.toThrow('Invalid download URL.')
    expect(apiClient.get).not.toHaveBeenCalled()
  })

  it('rejects non-http signed URLs', async () => {
    const payload = JSON.stringify({
      download_url: 'javascript:alert(1)',
      expires_in: 300,
      file_name: 'hero.zip',
    })
    vi.mocked(apiClient.get).mockResolvedValue({
      data: new Blob([payload], { type: 'application/json' }),
      headers: { 'content-type': 'application/json' },
    })

    await expect(
      downloadCatalogFile('product', 'prod-id', 'file-id', 'package.zip'),
    ).rejects.toThrow('Invalid download URL.')
  })
})
