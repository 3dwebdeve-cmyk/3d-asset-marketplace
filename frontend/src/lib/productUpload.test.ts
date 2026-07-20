import { describe, expect, it } from 'vitest'

import { formatFileSize, formatFormatLabel } from './productUpload'

describe('productUpload', () => {
  it('formats file sizes for display', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2.0 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('formats model format labels', () => {
    expect(formatFormatLabel('usdz')).toBe('USDZ')
    expect(formatFormatLabel(' glb ')).toBe('GLB')
  })
})
