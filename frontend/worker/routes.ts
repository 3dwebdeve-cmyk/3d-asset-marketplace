/**
 * Every page address the app knows (the <Route path> list in src/App.tsx). Anything else is a
 * "page not found" and must answer 404, so search engines drop it instead of indexing a copy of
 * the home page. routes.test.ts fails when this list and App.tsx drift apart.
 *
 * `:name` matches one path segment and a trailing `/*` matches anything below. Matching ignores
 * letter case, as React Router does.
 */
export const APP_ROUTE_PATTERNS: readonly string[] = [
  '/',
  '/categories',
  '/home',
  '/Home',
  '/about',
  '/terms',
  '/privacy',
  '/contact',
  '/custom-projects',
  '/products',
  '/Products',
  '/products/:slug',
  '/Products/:slug',
  '/3d-models',
  '/3d-models/:categorySlug',
  '/3D-models',
  '/plugins',
  '/Plugins',
  '/plugins/:slug',
  '/Plugins/:slug',
  '/register',
  '/login',
  '/admin/*',
  '/admin',
  '/console/login',
  '/forgot-password',
  '/reset-password/:uid/:token',
  '/verify-email/resend',
  '/verify-email/:uid/:token',
  '/dashboard',
  '/dashboard/orders',
  '/dashboard/downloads',
  '/dashboard/wishlist',
  '/dashboard/password',
  '/dashboard/orders/:orderId',
  '/profile',
  '/cart',
  '/checkout/success',
  '/checkout/cancel',
  '/console',
  '/console/categories',
  '/console/categories/:categoryId',
  '/console/products',
  '/console/products/:productId',
  '/console/plugins',
  '/console/plugins/:pluginId',
  '/console/plugin-categories',
  '/console/plugin-categories/:categoryId',
  '/console/orders',
  '/console/orders/:orderId',
  '/console/payments',
  '/console/payments/:paymentId',
  '/console/reviews',
  '/console/downloads',
  '/console/analytics',
  '/console/users',
  '/console/users/:userId',
  '/console/security',
]

function toRegExp(pattern: string): RegExp {
  const source = pattern
    .split('/')
    .map((segment) => {
      if (segment === '*') return '.*'
      if (segment.startsWith(':')) return '[^/]+'
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  // "/admin/*" also matches "/admin" itself, like React Router.
  return new RegExp(`^${source.replace(/\/\.\*$/, '(?:/.*)?')}$`, 'i')
}

const ROUTE_REGEXPS = APP_ROUTE_PATTERNS.map(toRegExp)

/** True when the app has a page for this (normalized, no trailing slash) path. */
export function isKnownAppPath(path: string): boolean {
  return ROUTE_REGEXPS.some((route) => route.test(path))
}
