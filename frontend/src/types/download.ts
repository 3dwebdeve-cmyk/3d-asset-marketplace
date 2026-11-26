import type { PackageKind } from '../lib/packages'
import type { OrderItemProductType } from './order'

export interface DownloadFile {
  id: string
  /** The package this zip is; '' for a plugin file or a model file from before packages. */
  package_kind: PackageKind | ''
  package_label: string
  file_name: string
  file_format: string
  file_size: number
  version: string
  download_url: string
  last_downloaded_at?: string | null
  /** Downloads left on this file over the buyer's purchases (0 = used up: buy it again). */
  downloads_left: number
}

export interface DownloadEntitlement {
  product_type: OrderItemProductType
  product_id: string
  title: string
  slug: string
  /** The packages of a model the user owns, in package order ([] for a plugin). */
  package_kinds: PackageKind[]
  /** False once every download is used: the item can be bought again. */
  has_downloads_left: boolean
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
  /** The package of the file downloaded ('' for a plugin file). */
  package_label: string
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

export interface SignedDownloadResponse {
  download_url: string
  expires_in: number
  file_name: string
}
