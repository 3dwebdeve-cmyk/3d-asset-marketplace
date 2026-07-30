import type { OrderItemProductType } from './order'

export interface DownloadFile {
  id: string
  file_name: string
  file_format: string
  file_size: number
  version: string
  download_url: string
  last_downloaded_at?: string | null
}

export interface DownloadEntitlement {
  product_type: OrderItemProductType
  product_id: string
  title: string
  slug: string
  files: DownloadFile[]
}

export interface DownloadHistoryEntry {
  id: string
  user_email: string
  user_full_name: string
  product_type: OrderItemProductType
  product_id: string
  file_id: string
  file_name: string
  invoice_number: string | null
  downloaded_at: string
}

export interface PaginatedDownloadHistory {
  count: number
  next: string | null
  previous: string | null
  results: DownloadHistoryEntry[]
}

export interface DownloadHistoryListParams {
  page?: number
  page_size?: number
}

export interface AdminDownloadHistoryListParams extends DownloadHistoryListParams {
  user_email?: string
  product_type?: OrderItemProductType
  product_id?: string
  ordering?: 'downloaded_at' | '-downloaded_at'
}

export interface OrderItemDownloadFile {
  id: string
  file_name: string
  file_format: string
  file_size: number
  version: string
  download_url: string
}
