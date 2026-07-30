import type {
  AdminDownloadHistoryListParams,
  DownloadEntitlement,
  DownloadHistoryListParams,
  PaginatedDownloadHistory,
} from '../types/download'
import { apiClient } from './client'

function toHistoryQuery(params: DownloadHistoryListParams | AdminDownloadHistoryListParams): string {
  const search = new URLSearchParams()
  if (params.page !== undefined) search.set('page', String(params.page))
  if (params.page_size !== undefined) search.set('page_size', String(params.page_size))
  if ('user_email' in params && params.user_email) {
    search.set('user_email', params.user_email)
  }
  if ('product_type' in params && params.product_type) {
    search.set('product_type', params.product_type)
  }
  if ('product_id' in params && params.product_id) {
    search.set('product_id', params.product_id)
  }
  if ('ordering' in params && params.ordering) {
    search.set('ordering', params.ordering)
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

export async function listDownloadEntitlements(): Promise<DownloadEntitlement[]> {
  const { data } = await apiClient.get<DownloadEntitlement[]>('/api/downloads/entitlements/')
  return data
}

export async function listDownloadHistory(
  params: DownloadHistoryListParams = {},
): Promise<PaginatedDownloadHistory> {
  const { data } = await apiClient.get<PaginatedDownloadHistory>(
    `/api/downloads/history/${toHistoryQuery(params)}`,
  )
  return data
}

export async function listAdminDownloadHistory(
  params: AdminDownloadHistoryListParams = {},
): Promise<PaginatedDownloadHistory> {
  const { data } = await apiClient.get<PaginatedDownloadHistory>(
    `/api/admin/downloads/history/${toHistoryQuery(params)}`,
  )
  return data
}

export function buildCatalogDownloadPath(
  productType: 'product' | 'plugin',
  productId: string,
  fileId: string,
): string {
  if (productType === 'product') {
    return `/api/downloads/products/${productId}/files/${fileId}/download/`
  }
  return `/api/downloads/plugins/${productId}/files/${fileId}/download/`
}

export async function downloadCatalogFile(
  productType: 'product' | 'plugin',
  productId: string,
  fileId: string,
  fileName: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(buildCatalogDownloadPath(productType, productId, fileId), {
    responseType: 'blob',
  })
  const objectUrl = URL.createObjectURL(data)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

export async function downloadCatalogFileByUrl(downloadUrl: string, fileName: string): Promise<void> {
  const { data } = await apiClient.get<Blob>(downloadUrl, { responseType: 'blob' })
  const objectUrl = URL.createObjectURL(data)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}
