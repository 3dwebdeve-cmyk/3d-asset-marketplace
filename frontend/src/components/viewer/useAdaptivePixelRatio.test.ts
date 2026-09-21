import { describe, expect, it, vi } from 'vitest'

import {
  getAdaptivePixelRatio,
  getAdaptiveShadowMapSize,
} from './useAdaptivePixelRatio'

describe('getAdaptivePixelRatio', () => {
  it('caps pixel ratio lower on mobile viewports', () => {
    vi.stubGlobal('window', {
      devicePixelRatio: 3,
      matchMedia: (query: string) => ({
        matches: query.includes('max-width') || query.includes('pointer'),
      }),
    })

    expect(getAdaptivePixelRatio()).toBe(1.25)
  })

  it('allows a higher cap on desktop viewports', () => {
    vi.stubGlobal('window', {
      devicePixelRatio: 3,
      matchMedia: () => ({ matches: false }),
    })

    expect(getAdaptivePixelRatio()).toBe(1.75)
  })
})

describe('getAdaptiveShadowMapSize', () => {
  it('uses 512 on mobile viewports', () => {
    vi.stubGlobal('window', {
      devicePixelRatio: 3,
      matchMedia: (query: string) => ({
        matches: query.includes('max-width') || query.includes('pointer'),
      }),
    })

    expect(getAdaptiveShadowMapSize()).toBe(512)
  })

  it('uses 1024 on desktop viewports', () => {
    vi.stubGlobal('window', {
      devicePixelRatio: 2,
      matchMedia: () => ({ matches: false }),
    })

    expect(getAdaptiveShadowMapSize()).toBe(1024)
  })
})
