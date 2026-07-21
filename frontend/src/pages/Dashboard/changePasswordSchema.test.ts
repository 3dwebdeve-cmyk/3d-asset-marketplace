import { describe, expect, it } from 'vitest'

import { changePasswordSchema } from './changePasswordSchema'

describe('changePasswordSchema', () => {
  it('accepts a valid password change payload', () => {
    const result = changePasswordSchema.safeParse({
      current_password: 'StrongPass123!',
      new_password: 'AnotherStrong123!',
      new_password_confirm: 'AnotherStrong123!',
    })

    expect(result.success).toBe(true)
  })

  it('rejects mismatched confirmation', () => {
    const result = changePasswordSchema.safeParse({
      current_password: 'StrongPass123!',
      new_password: 'AnotherStrong123!',
      new_password_confirm: 'DifferentStrong123!',
    })

    expect(result.success).toBe(false)
  })

  it('rejects new password equal to current password', () => {
    const result = changePasswordSchema.safeParse({
      current_password: 'StrongPass123!',
      new_password: 'StrongPass123!',
      new_password_confirm: 'StrongPass123!',
    })

    expect(result.success).toBe(false)
  })
})
