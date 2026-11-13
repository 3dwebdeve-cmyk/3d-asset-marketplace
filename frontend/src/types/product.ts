import type { CategoryParent } from './category'

export type ProductStatus =
  | 'draft'
  | 'pending_review'
  | 'awaiting_price'
  | 'published'
  | 'rejected'
  | 'archived'
/** Text for a status in the console; unknown values fall back to the raw words. */
export function productStatusLabel(status: ProductStatus): string {
  return status === 'awaiting_price' ? 'Waiting for price' : status.replace(/_/g, ' ')
}

export type ProductUploadKind = 'free' | 'paid'
export type ProductLicenseType = 'standard' | 'extended' | 'editorial'

export interface ProductImage {
  id: string
  image_url: string
  display_order: number
  is_primary: boolean
  edge_colors?: { left: string; right: string } | null
  aspect_ratio?: number | null
  created_at: string
}

export interface ProductFile {
  id: string
  file_name: string
  file_format: string
  file_size: number
  storage_path: string
  version: string
  is_preview: boolean
  created_at: string
  updated_at: string
}

export interface AdminProduct {
  id: string
  name: string
  slug: string
  sku: string | null
  import_batch_id: string
  import_source: string
  glb_checksum: string
  has_thumbnail: boolean
  has_preview: boolean
  has_package: boolean
  description: string
  short_description: string
  price: string
  currency: string
  discount_price: string | null
  /** When the sale ends (ISO 8601 UTC); null means no end. */
  discount_ends_at?: string | null
  /** True while the sale price applies (set and not ended). */
  discount_active?: boolean
  /** Free models are published by QA; paid models go on to the Pricing page. */
  upload_kind?: ProductUploadKind
  /** Price 0: downloaded for free, without checkout. */
  is_free?: boolean
  thumbnail: string
  preview_model: string
  preview_video: string
  /** 360° turntable: 36 frame URLs in spin order, or [] when the model has none. */
  spin_images?: string[]
  polygon_count: number | null
  vertex_count: number | null
  software_used: string
  pbr_ready: boolean
  game_ready: boolean
  license_type: ProductLicenseType
  average_rating: string
  review_count: number
  total_downloads: number
  status: ProductStatus
  reject_reason: string
  qa_notes: string
  reviewed_at: string | null
  reviewed_by: string | null
  /** A published model was uploaded again: still on sale, waiting in the QA queue. */
  pending_update?: boolean
  category: CategoryParent
  images: ProductImage[]
  files: ProductFile[]
  created_at: string
  updated_at: string
}

/** A live model's re-upload that waits for review (the model stays on sale meanwhile). */
export function isLiveUpdate(product: Pick<AdminProduct, 'status' | 'pending_update'>): boolean {
  return product.status === 'published' && Boolean(product.pending_update)
}

export interface AdminProductRejectPayload {
  reason: string
  qa_notes?: string
}

export interface AdminProductBulkDeleteResult {
  deleted: string[]
  archived: string[]
  not_found: string[]
}

/** A free model (price 0) is downloaded without checkout. */
export function isFreeProduct(product: { is_free?: boolean; price: string }): boolean {
  return product.is_free ?? Number(product.price) === 0
}

/** One call from the uploader, from the activity log. */
export interface UploaderImport {
  id: string
  target_id: string
  created_at: string
  metadata: {
    created?: number
    updated?: number
    skipped?: number
    failed?: number
    /** Model ID → why it did not reach QA. */
    skipped_reasons?: Record<string, string>
  }
}

/** found: in storage. missing: not there. unknown: storage did not answer. external: another host. */
export type ProductFileCheckStatus = 'found' | 'missing' | 'unknown' | 'external'

/** One file a product uses, checked against storage (R2 or local media). */
export interface ProductFileCheckEntry {
  role: 'thumbnail' | 'preview' | 'preview_video' | 'image' | 'package' | 'preview_file'
  label: string
  /** Object key in the bucket, or the full URL for a file on another host. */
  key: string
  bucket: 'public' | 'private' | 'external' | 'invalid'
  status: ProductFileCheckStatus
}

export interface ProductFileCheck {
  total: number
  missing: number
  unknown: number
  files: ProductFileCheckEntry[]
}

export interface AdminProductCreatePayload {
  category_id: string
  name: string
  description?: string
  short_description?: string
  price: string
  currency?: string
  discount_price?: string | null
  thumbnail?: string
  preview_model?: string
  preview_video?: string
  polygon_count?: number | null
  vertex_count?: number | null
  software_used?: string
  pbr_ready?: boolean
  game_ready?: boolean
  license_type?: ProductLicenseType
  status?: ProductStatus
  sku?: string | null
  import_batch_id?: string
  import_source?: string
  glb_checksum?: string
  has_thumbnail?: boolean
  has_preview?: boolean
  has_package?: boolean
}

export interface AdminProductUpdatePayload {
  category_id?: string
  name?: string
  slug?: string
  description?: string
  short_description?: string
  price?: string
  currency?: string
  discount_price?: string | null
  /** ISO 8601 with time zone, in the future; null removes the end date. */
  discount_ends_at?: string | null
  thumbnail?: string
  preview_model?: string
  preview_video?: string
  polygon_count?: number | null
  vertex_count?: number | null
  software_used?: string
  pbr_ready?: boolean
  game_ready?: boolean
  license_type?: ProductLicenseType
  status?: ProductStatus
  sku?: string | null
  import_batch_id?: string
  import_source?: string
  glb_checksum?: string
  has_thumbnail?: boolean
  has_preview?: boolean
  has_package?: boolean
}

export interface PaginatedAdminProducts {
  count: number
  next: string | null
  previous: string | null
  results: AdminProduct[]
}

export interface AdminProductListParams {
  page?: number
  page_size?: number
  status?: ProductStatus
  /** With status pending_review: only free or only paid models. */
  kind?: ProductUploadKind
  category_id?: string
  search?: string
  sku?: string
  import_batch_id?: string
  ordering?: string
}

export interface ProductImageUploadPayload {
  image: File
  display_order?: number
  is_primary?: boolean
}

export interface ProductFileUploadPayload {
  file: File
  version?: string
  is_preview?: boolean
}

export interface PublicProduct {
  id: string
  name: string
  slug: string
  short_description: string
  price: string
  currency: string
  discount_price: string | null
  /** When the sale ends (ISO 8601 UTC); null means no end. */
  discount_ends_at?: string | null
  /** Price 0: downloaded for free, without checkout. */
  is_free?: boolean
  thumbnail: string
  software_used: string
  formats?: string[]
  /** The product page has a 360° view (for the card's "360°" badge). */
  has_360?: boolean
  category: CategoryParent
  license_type: ProductLicenseType
  average_rating: string
  review_count: number
  total_downloads: number
  created_at: string
}

export interface PublicProductFile {
  id: string
  file_name: string
  file_format: string
  file_size: number
  version: string
  is_preview: boolean
}

export interface PublicProductDetail {
  formats?: string[]
  id: string
  name: string
  slug: string
  description: string
  short_description: string
  price: string
  currency: string
  discount_price: string | null
  /** When the sale ends (ISO 8601 UTC); null means no end. */
  discount_ends_at?: string | null
  /** Price 0: downloaded for free, without checkout. */
  is_free?: boolean
  thumbnail: string
  preview_model: string
  preview_video: string
  /** 360° turntable: 36 frame URLs in spin order, or [] when the model has none. */
  spin_images?: string[]
  polygon_count: number | null
  vertex_count: number | null
  software_used: string
  pbr_ready: boolean
  game_ready: boolean
  license_type: ProductLicenseType
  average_rating: string
  review_count: number
  total_downloads: number
  category: CategoryParent
  images: ProductImage[]
  files: PublicProductFile[]
  created_at: string
  updated_at: string
}

export interface PaginatedPublicProducts {
  count: number
  next: string | null
  previous: string | null
  results: PublicProduct[]
}

export interface PublicProductListParams {
  is_free?: boolean
  page?: number
  page_size?: number
  category_id?: string
  search?: string
  ordering?: string
  pbr_ready?: boolean
  game_ready?: boolean
}
