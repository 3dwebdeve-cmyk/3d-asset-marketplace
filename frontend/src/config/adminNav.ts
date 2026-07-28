export interface AdminNavItem {
  label: string
  to: string
  end?: boolean
  enabled: boolean
  comingSoon?: boolean
}

export const adminNavItems: AdminNavItem[] = [
  { label: 'Dashboard', to: '/admin', end: true, enabled: true },
  { label: 'Products', to: '/admin/products', enabled: true },
  { label: 'Plugins', to: '/admin/plugins', enabled: true },
  { label: 'Categories', to: '/admin/categories', enabled: true },
  { label: 'Users', to: '/admin/users', enabled: true },
  { label: 'Orders', to: '/admin/orders', enabled: true },
  { label: 'Projects', to: '/admin/projects', enabled: true },
  { label: 'Analytics', to: '/admin/analytics', enabled: false, comingSoon: true },
]
