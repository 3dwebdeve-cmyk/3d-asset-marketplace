import type { CategoryParent } from './category'

export type ProductStatus =
  | 'draft'
  | 'pending_review'
  | 'published'
  | 'rejected'
  | 'archived'
export type ProductLicenseType = 'standard' | 'extended' | 'editorial'

export interface ProductImage {
  id: string
  image_url: string
  display_order: number
  is_primary: boolean
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
  thumbnail: string
  preview_model: string
  preview_video: string
  polygon_count: number | null
  vertex_count: number | null
  software_used: string
  animated: boolean
  rigged: boolean
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
  category: CategoryParent
  images: ProductImage[]
  files: ProductFile[]
  created_at: string
  updated_at: string
}

export interface AdminProductRejectPayload {
  reason: string
  qa_notes?: string
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
  animated?: boolean
  rigged?: boolean
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
  thumbnail?: string
  preview_model?: string
  preview_video?: string
  polygon_count?: number | null
  vertex_count?: number | null
  software_used?: string
  animated?: boolean
  rigged?: boolean
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
  thumbnail: string
  software_used: string
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
  id: string
  name: string
  slug: string
  description: string
  short_description: string
  price: string
  currency: string
  discount_price: string | null
  thumbnail: string
  preview_model: string
  preview_video: string
  polygon_count: number | null
  vertex_count: number | null
  software_used: string
  animated: boolean
  rigged: boolean
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
  page?: number
  page_size?: number
  category_id?: string
  search?: string
  ordering?: string
  animated?: boolean
  rigged?: boolean
  pbr_ready?: boolean
  game_ready?: boolean
}
