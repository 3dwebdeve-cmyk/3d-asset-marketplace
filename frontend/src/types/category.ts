export interface CategoryParent {
  id: string
  name: string
  slug: string
}

export interface AdminCategory {
  id: string
  name: string
  slug: string
  description: string
  image: string
  parent: CategoryParent | null
  is_active: boolean
  /** The Model ID code of the category's models (ELE in ELE-000001); null until set. */
  code: string | null
  /** Created by an upload and waiting for an administrator (always hidden meanwhile). */
  pending_approval: boolean
  created_by_import: boolean
  created_from_batch: string
  /** Rejected while it had models: stays hidden, its models cannot be approved. */
  rejected_at: string | null
  product_count: number
  created_at: string
  updated_at: string
}

export interface AdminCategoryCreatePayload {
  name: string
  description?: string
  image?: string
  parent_id?: string | null
  code?: string
}

export interface AdminCategoryUpdatePayload {
  name?: string
  slug?: string
  description?: string
  image?: string
  parent_id?: string | null
  is_active?: boolean
  /** null removes the code (only while the category has no models). */
  code?: string | null
}

export interface PaginatedAdminCategories {
  count: number
  next: string | null
  previous: string | null
  results: AdminCategory[]
}

export interface AdminCategoryListParams {
  page?: number
  page_size?: number
  is_active?: boolean
  pending_approval?: boolean
  parent_id?: string
  search?: string
}

export interface CategoryPublic {
  id: string
  name: string
  slug: string
  description: string
  image: string
  parent: CategoryParent | null
  created_at: string
}

export interface PaginatedPublicCategories {
  count: number
  next: string | null
  previous: string | null
  results: CategoryPublic[]
}

export interface PublicCategoryListParams {
  page?: number
  page_size?: number
  parent_id?: string
  search?: string
}
