import { ADMIN_BASE, adminPath } from './adminPaths'

export interface AdminNavItem {
  label: string
  to: string
  end?: boolean
  enabled: boolean
  comingSoon?: boolean
}

export const adminNavItems: AdminNavItem[] = [
  { label: 'Dashboard', to: ADMIN_BASE, end: true, enabled: true },
  { label: 'Products', to: adminPath('products'), enabled: true },
  { label: 'Archived', to: adminPath('archived'), enabled: true },
  {
    label: 'QA queue',
    to: `${adminPath('products')}?status=pending_review`,
    enabled: true,
  },
  { label: 'Plugins', to: adminPath('plugins'), enabled: true },
  { label: 'Categories', to: adminPath('categories'), enabled: true },
  { label: 'Users', to: adminPath('users'), enabled: true },
  { label: 'Orders', to: adminPath('orders'), enabled: true },
  { label: 'Payments', to: adminPath('payments'), enabled: true },
  { label: 'Reviews', to: adminPath('reviews'), enabled: true },
  { label: 'Downloads', to: adminPath('downloads'), enabled: true },
  { label: 'Analytics', to: adminPath('analytics'), enabled: true },
  { label: 'Security', to: adminPath('security'), enabled: true },
]
