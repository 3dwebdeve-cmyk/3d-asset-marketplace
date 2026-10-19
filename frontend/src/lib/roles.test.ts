import { describe, expect, it } from 'vitest'

import { isAdministrator, ROLE_ADMINISTRATOR, ROLE_CUSTOMER } from './roles'

describe('roles', () => {
  it('identifies administrator role', () => {
    expect(isAdministrator(ROLE_ADMINISTRATOR)).toBe(true)
    expect(isAdministrator(ROLE_CUSTOMER)).toBe(false)
    expect(isAdministrator(undefined)).toBe(false)
  })
})
