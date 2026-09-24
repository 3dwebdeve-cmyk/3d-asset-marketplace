/**
 * SPA administrator control panel paths.
 *
 * Kept under `/console` so Compose/Nginx can proxy `/admin/` to Django admin
 * without stealing React deep links. REST APIs stay at `/api/v1/admin/…`.
 */

export const ADMIN_BASE = '/console'
export const ADMIN_LOGIN = `${ADMIN_BASE}/login`

/** Build a console path, e.g. adminPath('products') → `/console/products`. */
export function adminPath(subpath = ''): string {
  const trimmed = subpath.trim()
  if (!trimmed || trimmed === '/') {
    return ADMIN_BASE
  }
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return `${ADMIN_BASE}${withSlash}`
}

export function isAdminSpaPath(pathname: string): boolean {
  return pathname === ADMIN_BASE || pathname.startsWith(`${ADMIN_BASE}/`)
}

export function isAdminLoginPath(pathname: string): boolean {
  return pathname === ADMIN_LOGIN
}

/**
 * Map legacy Vite `/admin…` bookmarks to `/console…`.
 * In Docker, Nginx serves `/admin/` as Django — these routes only apply in Vite.
 */
export function legacyAdminToConsolePath(
  pathname: string,
  search = '',
): string | null {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const rest = pathname.slice('/admin'.length)
    return `${ADMIN_BASE}${rest}${search}`
  }
  return null
}
