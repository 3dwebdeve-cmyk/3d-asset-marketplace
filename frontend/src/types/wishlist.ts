import type { ProductLicenseType } from './product'
import type { PluginLicenseType } from './plugin'

export type WishlistProductType = 'product' | 'plugin'

export type WishlistOrdering =
  | 'created_at'
  | '-created_at'
  | 'updated_at'
  | '-updated_at'

export interface WishlistCatalogCategory {
  id: string
  name: string
  slug: string
}

export interface WishlistCatalogItem {
  name: string
  slug: string
  short_description: string
  thumbnail: string
  price: string
  discount_price: string | null
  currency: string
  license_type: ProductLicenseType | PluginLicenseType
  average_rating: string
  version?: string
  compatibility?: string
  category: WishlistCatalogCategory
  is_available: boolean
}

export interface WishlistItem {
  id: string
  product_type: WishlistProductType
  product_id: string
  catalog: WishlistCatalogItem | null
  created_at: string
  updated_at: string
}

export interface PaginatedWishlistItems {
  count: number
  next: string | null
  previous: string | null
  results: WishlistItem[]
}

export interface WishlistAddPayload {
  product_type: WishlistProductType
  product_id: string
}

export interface WishlistListParams {
  page?: number
  page_size?: number
  product_type?: WishlistProductType
  ordering?: WishlistOrdering
}
