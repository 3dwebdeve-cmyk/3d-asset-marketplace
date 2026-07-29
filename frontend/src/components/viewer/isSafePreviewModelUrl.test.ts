import { describe, expect, it } from 'vitest'

import { isSafePreviewModelUrl } from './isSafePreviewModelUrl'

describe('isSafePreviewModelUrl', () => {
  it('accepts absolute http(s) GLB/glTF URLs', () => {
    expect(isSafePreviewModelUrl('https://cdn.example.com/preview.glb')).toBe(true)
    expect(isSafePreviewModelUrl('http://127.0.0.1:8000/media/products/files/a.gltf')).toBe(
      true,
    )
    expect(isSafePreviewModelUrl('  https://cdn.example.com/models/ship.GLB  ')).toBe(true)
  })

  it('rejects blank, relative, non-http, and non-model URLs', () => {
    expect(isSafePreviewModelUrl('')).toBe(false)
    expect(isSafePreviewModelUrl('   ')).toBe(false)
    expect(isSafePreviewModelUrl('/media/products/files/a.glb')).toBe(false)
    expect(isSafePreviewModelUrl('ftp://cdn.example.com/a.glb')).toBe(false)
    expect(isSafePreviewModelUrl('https://cdn.example.com/package.zip')).toBe(false)
    expect(isSafePreviewModelUrl('javascript:alert(1)')).toBe(false)
  })
})
