import type { PackageKind } from '../lib/packages'
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
  /** A package row (one zip sold on its own); '' for the preview or a file with no kind. */
  package_kind: PackageKind | ''
  package_label: string
  /** null: no price yet, so the package is not sold. */
  price: string | null
  discount_price: string | null
  discount_ends_at: string | null
  created_at: string
  updated_at: string
}

/** The category as QA sees it: a model in a pending or rejected category cannot be approved. */
export interface AdminProductCategory extends CategoryParent {
  code: string | null
  is_active: boolean
  pending_approval: boolean
  rejected_at: string | null
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
  category: AdminProductCategory
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

/** The admin's price text for a model: free uploads by their folder, paid ones by their
 * cheapest priced package ("From"), or not priced yet. Never by is_free (a paid model with no
 * priced package has a summary price of 0). */
export function adminPriceLabel(product: Pick<AdminProduct, 'upload_kind' | 'price' | 'currency'>): string {
  if (product.upload_kind === 'free') return 'Free'
  return Number(product.price) > 0 ? `From ${product.currency} ${product.price}` : 'Not priced'
}

/** A model the import refused, with the reason in words (backend/products/import_reasons.py). */
export interface UploaderImportRefusal {
  model_id: string
  name: string
  reason: string
  text: string
  /** What to do next; '' for a reason the table does not know. */
  action: string
}

/** One call from the uploader. */
export interface UploaderImport {
  id: string
  import_batch_id: string
  created_at: string
  created: number
  updated: number
  skipped: number
  failed: number
  refused: UploaderImportRefusal[]
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
  currency?: string
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
  currency?: string
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
  /** Which package the file is; required for any file that is not the preview. */
  package_kind?: PackageKind
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
  /** The lowest package price displayed on the card; null with one package. */
  price_from?: string | null
  category: CategoryParent
  license_type: ProductLicenseType
  average_rating: string
  review_count: number
  total_downloads: number
  created_at: string
}

/** One package a buyer can choose on the product page (only priced packages are listed). */
export interface PublicProductPackage {
  kind: PackageKind
  label: string
  /** What the package holds. */
  description: string
  file_size: number
  price: string
  /** The running sale price, else null. */
  discount_price: string | null
  /** What a buyer pays now. */
  effective_price: string
  sale_ends_at: string | null
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
  license_type: ProductLicenseType
  average_rating: string
  review_count: number
  total_downloads: number
  category: CategoryParent
  images: ProductImage[]
  files: PublicProductFile[]
  /** The packages for sale, in package order. */
  packages: PublicProductPackage[]
  /** The All variations offer for a buyer who owns nothing of this model. */
  bundle: BundleOffer
  created_at: string
  updated_at: string
}

/** All variations: every package of a model in one download at 25% off (the Whole File zip). */
export interface BundleOffer {
  eligible: boolean
  /** Why it is not offered; '' when it is. */
  reason: string
  /** The packages it covers (the ones the buyer does not own yet). */
  kinds: PackageKind[]
  /** Those packages at their price now. */
  subtotal: string
  /** What the buyer pays. */
  price: string
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
