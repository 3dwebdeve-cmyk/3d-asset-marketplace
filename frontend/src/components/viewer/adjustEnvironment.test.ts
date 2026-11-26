import { DataTexture, DataUtils, HalfFloatType, RGBAFormat } from 'three'
import { describe, expect, it } from 'vitest'

import { adjustEnvironment, DEFAULT_ENVIRONMENT_ADJUSTMENTS } from './adjustEnvironment'

describe('HDRI tone adjustments', () => {
  it('adjusts the intended tones and colors without modifying the source map', () => {
    const source = new DataTexture(
      Uint16Array.from([0.25, 0.25, 0.25, 1, 2, 2, 2, 1, 1, 0.5, 0.25, 1], DataUtils.toHalfFloat),
      3, 1, RGBAFormat, HalfFloatType,
    )
    const defaults = DEFAULT_ENVIRONMENT_ADJUSTMENTS
    const samples = (adjustments: Partial<typeof defaults>) => {
      const texture = adjustEnvironment(source, { ...defaults, ...adjustments })
      if (!(texture instanceof DataTexture)) throw new Error('Expected a data texture')
      const result = Array.from(texture.image.data as Uint16Array, DataUtils.fromHalfFloat)
      texture.dispose()
      return result
    }

    expect(adjustEnvironment(source, defaults)).toBe(source)
    expect(samples({ exposure: 1 })[4]).toBeCloseTo(4)
    expect(samples({ highlights: 100 }).slice(0, 5)).toEqual([0.25, 0.25, 0.25, 1, 4])
    const shadows = samples({ shadows: 100 })
    expect(shadows[0]).toBeGreaterThan(0.25)
    expect(shadows[4]).toBe(2)
    expect(samples({ gamma: 1 }).slice(0, 5)).toEqual([0.5, 0.5, 0.5, 1, 2])
    expect(samples({ gamma: -0.5 })[0]).toBeCloseTo(0.0625)
    expect(Array.from(source.image.data!, DataUtils.fromHalfFloat)).toEqual(
      [0.25, 0.25, 0.25, 1, 2, 2, 2, 1, 1, 0.5, 0.25, 1],
    )
    source.dispose()
  })
})
