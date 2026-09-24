export type DashboardNavIcon =
  | 'home'
  | 'wishlist'
  | 'orders'
  | 'downloads'
  | 'profile'

export interface DashboardNavItem {
  to: string
  label: string
  icon: DashboardNavIcon
  /** Match the path exactly (no nested routes). */
  end?: boolean
}

export const dashboardNavItems: DashboardNavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: 'home',
    end: true,
  },
  {
    to: '/dashboard/wishlist',
    label: 'Wishlist',
    icon: 'wishlist',
    end: true,
  },
  {
    to: '/dashboard/orders',
    label: 'My Orders',
    icon: 'orders',
  },
  {
    to: '/dashboard/downloads',
    label: 'My Downloads',
    icon: 'downloads',
    end: true,
  },
  {
    to: '/profile',
    label: 'Edit profile',
    icon: 'profile',
    end: true,
  },
]

export function isDashboardChromePath(pathname: string): boolean {
  return (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/profile'
  )
}
