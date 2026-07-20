export interface AdminDashboardUsersStats {
  total: number
  active: number
}

export interface AdminDashboardProductsStats {
  total: number
  published: number
  draft: number
  archived: number
}

export interface AdminDashboardCategoriesStats {
  total: number
  live: number
}

export interface AdminDashboardPluginsStats {
  total: number
}

export interface AdminDashboardProjectsStats {
  pending: number
  live: number
  completed: number
}

export interface AdminDashboardSalesStats {
  monthly_revenue: string
  monthly_orders: number
  currency: string
}

export interface AdminDashboardCategoryBreakdown {
  id: string
  name: string
  slug: string
  is_active: boolean
  product_count: number
  published_product_count: number
}

export interface AdminDashboardStats {
  users: AdminDashboardUsersStats
  products: AdminDashboardProductsStats
  categories: AdminDashboardCategoriesStats
  plugins: AdminDashboardPluginsStats
  projects: AdminDashboardProjectsStats
  sales: AdminDashboardSalesStats
  category_breakdown: AdminDashboardCategoryBreakdown[]
}
