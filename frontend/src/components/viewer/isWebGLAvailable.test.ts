import { describe, expect, it, vi } from 'vitest'

import { isWebGLAvailable } from './isWebGLAvailable'

describe('isWebGLAvailable', () => {
  it('returns true when a WebGL context can be created', () => {
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: (type: string) => (type === 'webgl2' ? {} : null),
      }),
    })

    expect(isWebGLAvailable()).toBe(true)
  })

  it('returns false when no WebGL context is available', () => {
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => null,
      }),
    })

    expect(isWebGLAvailable()).toBe(false)
  })
})
