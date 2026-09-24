import { describe, expect, it } from 'vitest'

import { safePostLoginPath, safeReturnLocation } from './safePostLoginPath'

describe('safePostLoginPath', () => {
  it('accepts internal absolute paths', () => {
    expect(safePostLoginPath('/dashboard')).toBe('/dashboard')
    expect(safePostLoginPath('/products/foo')).toBe('/products/foo')
  })

  it('preserves query strings and hash for checkout return', () => {
    expect(safePostLoginPath('/checkout/success?order_id=abc-123')).toBe(
      '/checkout/success?order_id=abc-123',
    )
    expect(safePostLoginPath('/checkout/success?order_id=abc&project_id=p1#x')).toBe(
      '/checkout/success?order_id=abc&project_id=p1#x',
    )
  })

  it('rejects external and unsafe paths', () => {
    expect(safePostLoginPath('https://evil.test')).toBeNull()
    expect(safePostLoginPath('//evil.test')).toBeNull()
    expect(safePostLoginPath('/evil\\path')).toBeNull()
    expect(safePostLoginPath(null)).toBeNull()
  })
})

describe('safeReturnLocation', () => {
  it('joins pathname and search from router state.from', () => {
    expect(
      safeReturnLocation({
        pathname: '/checkout/success',
        search: '?order_id=order-1',
      }),
    ).toBe('/checkout/success?order_id=order-1')
  })

  it('returns null without pathname', () => {
    expect(safeReturnLocation({ search: '?order_id=1' })).toBeNull()
    expect(safeReturnLocation(null)).toBeNull()
  })
})
