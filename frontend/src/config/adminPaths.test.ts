import { describe, expect, it } from 'vitest'

import {
  ADMIN_BASE,
  ADMIN_LOGIN,
  adminPath,
  isAdminLoginPath,
  isAdminSpaPath,
  legacyAdminToConsolePath,
} from './adminPaths'

describe('adminPaths', () => {
  it('uses /console as the SPA admin base (not /admin)', () => {
    expect(ADMIN_BASE).toBe('/console')
    expect(ADMIN_LOGIN).toBe('/console/login')
  })

  it('builds nested console paths', () => {
    expect(adminPath()).toBe('/console')
    expect(adminPath('products')).toBe('/console/products')
    expect(adminPath('/products/abc')).toBe('/console/products/abc')
  })

  it('detects console SPA paths', () => {
    expect(isAdminSpaPath('/console')).toBe(true)
    expect(isAdminSpaPath('/console/products')).toBe(true)
    expect(isAdminSpaPath('/admin')).toBe(false)
    expect(isAdminLoginPath('/console/login')).toBe(true)
    expect(isAdminLoginPath('/console')).toBe(false)
  })

  it('maps legacy /admin bookmarks to /console', () => {
    expect(legacyAdminToConsolePath('/admin')).toBe('/console')
    expect(legacyAdminToConsolePath('/admin/login')).toBe('/console/login')
    expect(
      legacyAdminToConsolePath('/admin/products', '?status=pending_review'),
    ).toBe('/console/products?status=pending_review')
    expect(legacyAdminToConsolePath('/dashboard')).toBeNull()
  })
})
