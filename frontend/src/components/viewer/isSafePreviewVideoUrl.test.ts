import { describe, expect, it } from 'vitest'

import { isSafePreviewVideoUrl } from './isSafePreviewVideoUrl'

describe('isSafePreviewVideoUrl', () => {
  it('accepts absolute http(s) video URLs', () => {
    expect(isSafePreviewVideoUrl('https://cdn.example.com/clip.mp4')).toBe(true)
    expect(isSafePreviewVideoUrl('http://cdn.example.com/clip.webm')).toBe(true)
  })

  it('rejects blank, relative, and non-video URLs', () => {
    expect(isSafePreviewVideoUrl('')).toBe(false)
    expect(isSafePreviewVideoUrl('/videos/clip.mp4')).toBe(false)
    expect(isSafePreviewVideoUrl('https://cdn.example.com/package.zip')).toBe(false)
    expect(isSafePreviewVideoUrl('javascript:alert(1)')).toBe(false)
  })
})
