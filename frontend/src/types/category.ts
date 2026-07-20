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
  created_at: string
  updated_at: string
}

export interface AdminCategoryCreatePayload {
  name: string
  description?: string
  image?: string
  parent_id?: string | null
}

export interface AdminCategoryUpdatePayload {
  name?: string
  slug?: string
  description?: string
  image?: string
  parent_id?: string | null
  is_active?: boolean
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
  parent_id?: string
  search?: string
}
