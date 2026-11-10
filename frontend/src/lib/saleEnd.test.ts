import { describe, expect, it } from 'vitest'

import { isLocalInputInPast, localInputToUtc, utcToLocalInput } from './saleEnd'

describe('saleEnd', () => {
  it('round-trips a UTC instant through the local input value', () => {
    const iso = '2031-06-15T09:30:00.000Z'
    const local = utcToLocalInput(iso)
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(localInputToUtc(local)).toBe(iso)
    // Same instant whatever the machine time zone.
    expect(new Date(local).toISOString()).toBe(iso)
  })

  it('treats the input value as local time when converting to UTC', () => {
    const value = '2031-06-15T12:00'
    expect(localInputToUtc(value)).toBe(new Date(2031, 5, 15, 12, 0).toISOString())
  })

  it('handles empty and invalid values', () => {
    expect(utcToLocalInput(null)).toBe('')
    expect(utcToLocalInput('nope')).toBe('')
    expect(localInputToUtc('')).toBeNull()
  })

  it('detects a past date', () => {
    const now = new Date(2030, 0, 1, 12, 0).getTime()
    expect(isLocalInputInPast('2030-01-01T11:59', now)).toBe(true)
    expect(isLocalInputInPast('2030-01-01T12:01', now)).toBe(false)
    expect(isLocalInputInPast('', now)).toBe(false)
  })
})
