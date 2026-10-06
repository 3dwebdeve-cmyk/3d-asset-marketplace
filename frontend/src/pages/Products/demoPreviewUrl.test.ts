import { describe, expect, it } from 'vitest'

import { resolveDemoPreviewUrl } from './demoPreviewUrl'

describe('resolveDemoPreviewUrl', () => {
  it('replaces the old triangle fixture for demo products', () => {
    expect(resolveDemoPreviewUrl(
      'demo-plant-pot',
      'http://localhost:5173/fixtures/e2e-preview.glb',
    )).toBe(`${window.location.origin}/fixtures/demo-plant-pot.glb`)
  })

  it('replaces old demo R2 placeholders but leaves customer previews alone', () => {
    const url = 'https://cdn.example.com/products/previews/demo/demo-oak-chair.glb'
    expect(resolveDemoPreviewUrl('demo-oak-chair', url)).toBe(
      `${window.location.origin}/fixtures/demo-oak-chair.glb`,
    )
    expect(resolveDemoPreviewUrl('customer-oak-chair', url)).toBe(url)
  })

  it('keeps a newly uploaded demo preview', () => {
    const url = 'https://cdn.example.com/products/previews/real-chair.glb'
    expect(resolveDemoPreviewUrl('demo-oak-chair', url)).toBe(url)
  })
})
