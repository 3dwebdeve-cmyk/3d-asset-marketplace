export type PluginStatus = 'draft' | 'published' | 'archived'
export type PluginLicenseType = 'standard' | 'extended' | 'commercial'
export type PluginOrdering = 'name' | '-name' | 'price' | '-price' | 'created_at' | '-created_at'

// ─── Public Plugin Types ───────────────────────────────────────────────────

export interface PublicPlugin {
  id: string
  name: string
  slug: string
  short_description: string
  price: string
  currency: string
  discount_price: string | null
  thumbnail: string
  version: string
  compatibility: string
  formats?: string[]
  license_type: PluginLicenseType
  average_rating: string
  review_count: number
  total_downloads: number
  category: PluginCategory
  created_at: string
}

export interface PublicPluginDetail extends PublicPlugin {
  description: string
  documentation_url: string
  images: PluginImage[]
  files: PublicPluginFile[]
  updated_at: string
}

export interface PublicPluginFile {
  id: string
  file_name: string
  file_format: string
  file_size: number
  version: string
  is_primary: boolean
}

export interface PaginatedPublicPlugins {
  count: number
  next: string | null
  previous: string | null
  results: PublicPlugin[]
}

export interface PublicPluginListParams {
  page?: number
  page_size?: number
  category_id?: string
  search?: string
  ordering?: PluginOrdering
}

export interface PublicPluginCategoryListParams {
  page?: number
  page_size?: number
  is_active?: boolean
  search?: string
}

export interface PluginCategory {
  id: string
  name: string
  slug: string
  description: string
  image: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PluginImage {
  id: string
  image_url: string
  display_order: number
  is_primary: boolean
  created_at: string
}

export interface PluginFile {
  id: string
  file_name: string
  file_format: string
  file_size: number
  version: string
  is_primary: boolean
  created_at: string
  updated_at: string
}

export interface AdminPlugin {
  id: string
  name: string
  slug: string
  description: string
  short_description: string
  price: string
  currency: string
  discount_price: string | null
  thumbnail: string
  version: string
  compatibility: string
  documentation_url: string
  license_type: PluginLicenseType
  average_rating: string
  review_count: number
  total_downloads: number
  status: PluginStatus
  category: PluginCategory
  images: PluginImage[]
  files: PluginFile[]
  created_at: string
  updated_at: string
}

export interface AdminPluginListItem {
  id: string
  name: string
  slug: string
  short_description: string
  price: string
  currency: string
  discount_price: string | null
  thumbnail: string
  version: string
  compatibility: string
  license_type: PluginLicenseType
  average_rating: string
  review_count: number
  total_downloads: number
  status: PluginStatus
  category: PluginCategory
  created_at: string
}

export interface AdminPluginCreatePayload {
  category_id: string
  name: string
  description?: string
  short_description?: string
  price: string
  currency?: string
  discount_price?: string | null
  thumbnail?: string
  version?: string
  compatibility?: string
  documentation_url?: string
  license_type?: PluginLicenseType
  status?: PluginStatus
}

export interface AdminPluginUpdatePayload {
  category_id?: string
  name?: string
  slug?: string
  description?: string
  short_description?: string
  price?: string
  currency?: string
  discount_price?: string | null
  thumbnail?: string
  version?: string
  compatibility?: string
  documentation_url?: string
  license_type?: PluginLicenseType
  status?: PluginStatus
}

export interface PaginatedAdminPlugins {
  count: number
  next: string | null
  previous: string | null
  results: AdminPluginListItem[]
}

export interface AdminPluginListParams {
  page?: number
  page_size?: number
  status?: PluginStatus
  category_id?: string
  search?: string
  ordering?: PluginOrdering
}

export interface PluginCategoryCreatePayload {
  name: string
  description?: string
  image?: string
}

export interface PluginCategoryUpdatePayload {
  name?: string
  slug?: string
  description?: string
  image?: string
  is_active?: boolean
}

export interface PaginatedPluginCategories {
  count: number
  next: string | null
  previous: string | null
  results: PluginCategory[]
}

export interface PluginCategoryListParams {
  page?: number
  page_size?: number
  is_active?: boolean
  search?: string
}

export interface PluginImageUploadPayload {
  image: File
  display_order?: number
  is_primary?: boolean
}

export interface PluginFileUploadPayload {
  file: File
  version?: string
  is_primary?: boolean
}
