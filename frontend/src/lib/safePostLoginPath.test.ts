import { describe, expect, it } from 'vitest'

import { safePostLoginPath } from './safePostLoginPath'

describe('safePostLoginPath', () => {
  it('accepts internal absolute paths', () => {
    expect(safePostLoginPath('/dashboard')).toBe('/dashboard')
    expect(safePostLoginPath('/products/foo')).toBe('/products/foo')
  })

  it('rejects external and unsafe paths', () => {
    expect(safePostLoginPath('https://evil.test')).toBeNull()
    expect(safePostLoginPath('//evil.test')).toBeNull()
    expect(safePostLoginPath('/evil\\path')).toBeNull()
    expect(safePostLoginPath(null)).toBeNull()
  })
})
