import type {
  AdminDownloadHistoryListParams,
  DownloadEntitlement,
  DownloadHistoryListParams,
  PaginatedDownloadHistory,
  SignedDownloadResponse,
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
  const { data } = await apiClient.get<DownloadEntitlement[]>('/api/v1/downloads/entitlements/')
  return data
}

export async function listDownloadHistory(
  params: DownloadHistoryListParams = {},
): Promise<PaginatedDownloadHistory> {
  const { data } = await apiClient.get<PaginatedDownloadHistory>(
    `/api/v1/downloads/history/${toHistoryQuery(params)}`,
  )
  return data
}

export async function listAdminDownloadHistory(
  params: AdminDownloadHistoryListParams = {},
): Promise<PaginatedDownloadHistory> {
  const { data } = await apiClient.get<PaginatedDownloadHistory>(
    `/api/v1/admin/downloads/history/${toHistoryQuery(params)}`,
  )
  return data
}

export function buildCatalogDownloadPath(
  productType: 'product' | 'plugin',
  productId: string,
  fileId: string,
): string {
  if (productType === 'product') {
    return `/api/v1/downloads/products/${productId}/files/${fileId}/download/`
  }
  return `/api/v1/downloads/plugins/${productId}/files/${fileId}/download/`
}

function headerValue(headers: unknown, name: string): string {
  if (!headers || typeof headers !== 'object') {
    return ''
  }
  const record = headers as Record<string, unknown> & { get?: (key: string) => unknown }
  if (typeof record.get === 'function') {
    const fromGet = record.get(name)
    if (typeof fromGet === 'string') {
      return fromGet
    }
  }
  const direct = record[name]
  if (typeof direct === 'string') {
    return direct
  }
  const lower = record[name.toLowerCase()]
  if (typeof lower === 'string') {
    return lower
  }
  return ''
}

function isSignedDownloadPayload(value: unknown): value is SignedDownloadResponse {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.download_url === 'string' &&
    typeof record.expires_in === 'number' &&
    typeof record.file_name === 'string'
  )
}

function assertSafeRemoteDownloadUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid download URL.')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Invalid download URL.')
  }
}

function triggerAnchorDownload(href: string, fileName: string): void {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = fileName
  anchor.rel = 'noopener noreferrer'
  anchor.target = '_blank'
  anchor.click()
}

function triggerBlobDownload(data: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(data)
  triggerAnchorDownload(objectUrl, fileName)
  URL.revokeObjectURL(objectUrl)
}

async function parseSignedDownload(data: Blob): Promise<SignedDownloadResponse> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await data.text())
  } catch {
    throw new Error('Could not download the file. Please try again.')
  }
  if (!isSignedDownloadPayload(parsed)) {
    throw new Error('Could not download the file. Please try again.')
  }
  return parsed
}

function catalogDownloadRequestPath(downloadUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(downloadUrl, window.location.origin)
  } catch {
    throw new Error('Invalid download URL.')
  }

  // Order payloads use absolute API links. Keep only the downloads path so the
  // bearer token stays on our API client and is never sent to another host.
  if (
    !parsed.pathname.startsWith('/api/v1/downloads/') ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error('Invalid download URL.')
  }

  return `${parsed.pathname}${parsed.search}`
}

async function fetchCatalogDownload(downloadUrl: string, fileName: string): Promise<void> {
  const requestPath = catalogDownloadRequestPath(downloadUrl)
  const response = await apiClient.get<Blob | SignedDownloadResponse>(requestPath, {
    responseType: 'blob',
  })
  const contentType = headerValue(response.headers, 'content-type')
  const payload = response.data

  if (isSignedDownloadPayload(payload)) {
    assertSafeRemoteDownloadUrl(payload.download_url)
    triggerAnchorDownload(payload.download_url, payload.file_name || fileName)
    return
  }

  if (payload instanceof Blob && contentType.toLowerCase().includes('application/json')) {
    const signed = await parseSignedDownload(payload)
    assertSafeRemoteDownloadUrl(signed.download_url)
    triggerAnchorDownload(signed.download_url, signed.file_name || fileName)
    return
  }

  if (payload instanceof Blob) {
    triggerBlobDownload(payload, fileName)
    return
  }

  throw new Error('Could not download the file. Please try again.')
}

export async function downloadCatalogFile(
  productType: 'product' | 'plugin',
  productId: string,
  fileId: string,
  fileName: string,
): Promise<void> {
  await fetchCatalogDownload(buildCatalogDownloadPath(productType, productId, fileId), fileName)
}

export async function downloadCatalogFileByUrl(downloadUrl: string, fileName: string): Promise<void> {
  await fetchCatalogDownload(downloadUrl, fileName)
}
