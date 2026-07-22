import type { CategoryParent } from './category'

export type ProductStatus = 'draft' | 'published' | 'archived'
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
  total_downloads: number
  status: ProductStatus
  category: CategoryParent
  images: ProductImage[]
  files: ProductFile[]
  created_at: string
  updated_at: string
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
  category: CategoryParent
  license_type: ProductLicenseType
  average_rating: string
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
}
