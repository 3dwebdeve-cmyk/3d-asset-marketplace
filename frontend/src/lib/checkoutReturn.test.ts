import { describe, expect, it, beforeEach } from 'vitest'

import {
  clearCheckoutOrderId,
  peekCheckoutOrderId,
  rememberCheckoutOrderId,
} from './checkoutReturn'

describe('checkoutReturn', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('remembers and peeks a pending order id', () => {
    rememberCheckoutOrderId('order-123')
    expect(peekCheckoutOrderId()).toBe('order-123')
    clearCheckoutOrderId()
    expect(peekCheckoutOrderId()).toBeNull()
  })
})
