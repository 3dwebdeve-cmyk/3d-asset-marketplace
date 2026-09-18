import { describe, expect, it } from 'vitest'

import { getPostLoginPath, isAdministrator, ROLE_ADMINISTRATOR, ROLE_CUSTOMER } from './roles'

describe('roles', () => {
  it('identifies administrator role', () => {
    expect(isAdministrator(ROLE_ADMINISTRATOR)).toBe(true)
    expect(isAdministrator(ROLE_CUSTOMER)).toBe(false)
    expect(isAdministrator(undefined)).toBe(false)
  })

  it('routes administrators to the admin login page helper path', () => {
    expect(getPostLoginPath(ROLE_ADMINISTRATOR)).toBe('/console/login')
    expect(getPostLoginPath(ROLE_CUSTOMER)).toBe('/dashboard')
  })
})
