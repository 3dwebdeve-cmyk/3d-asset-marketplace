import { describe, expect, it } from 'vitest'

import {
  formatDate,
  formatDateTime,
  formatFileSize,
  formatLocaleDateTime,
  formatMoney,
  formatMoneyPlain,
} from './format'
import { discountPercent } from './pricing'

describe('formatFileSize', () => {
  it('formats bytes, KB, and MB', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2.0 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('treats invalid sizes as 0 B', () => {
    expect(formatFileSize(Number.NaN)).toBe('0 B')
    expect(formatFileSize(-1)).toBe('0 B')
  })
})

describe('formatMoney', () => {
  it('formats with Intl currency', () => {
    expect(formatMoney('12.5', 'USD')).toBe('$12.50')
  })

  it('falls back for null and non-numeric amounts', () => {
    expect(formatMoney(null, 'USD')).toBe('—')
    expect(formatMoney('abc', 'USD')).toBe('USD abc')
  })
})

describe('formatMoneyPlain', () => {
  it('joins currency and amount', () => {
    expect(formatMoneyPlain('12.00', 'USD')).toBe('USD 12.00')
    expect(formatMoneyPlain(null, 'USD')).toBe('—')
  })
})

describe('formatDate / formatDateTime', () => {
  it('formats a known ISO timestamp', () => {
    const iso = '2026-03-12T15:30:00.000Z'
    expect(formatDate(iso)).toMatch(/2026/)
    expect(formatDateTime(iso)).toMatch(/2026/)
  })

  it('returns fallback for invalid values', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('not-a-date')).toBe('—')
    expect(formatDateTime('')).toBe('—')
    expect(formatLocaleDateTime('bad')).toBe('bad')
  })
})

describe('discountPercent', () => {
  it('rounds the discount percentage', () => {
    expect(discountPercent('100', '75')).toBe(25)
  })

  it('returns null when discount is invalid', () => {
    expect(discountPercent('0', '10')).toBeNull()
    expect(discountPercent('50', '60')).toBeNull()
    expect(discountPercent('abc', '10')).toBeNull()
  })
})
