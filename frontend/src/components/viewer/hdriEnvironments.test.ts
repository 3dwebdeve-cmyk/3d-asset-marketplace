import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FloatType } from 'three'
import { EXRLoader } from 'three-stdlib'
import { describe, expect, it } from 'vitest'
import { DEFAULT_HDRI_ENVIRONMENT_ID, HDRI_ENVIRONMENTS } from './hdriEnvironments'

describe('startup HDRI resource budget', () => {
  it('ships a decodable, browser-sized HDR panorama without losing lighting highlights', () => {
    const studio = HDRI_ENVIRONMENTS.find(option => option.id === DEFAULT_HDRI_ENVIRONMENT_ID)!
    const bytes = readFileSync(resolve('public', studio.hdrPath.slice(1)))
    const image = new EXRLoader().setDataType(FloatType).parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    )

    // The 4K master previously stalled browser/GPU startup, hiding checkout
    // behind the startup overlay. Test the actual shipped asset, not its name.
    expect(image.width).toBeLessThanOrEqual(1024)
    expect(image.height).toBe(image.width / 2)
    expect(bytes.length).toBeLessThan(2 * 1024 * 1024)
    let peak = 0
    for (let index = 0; index < image.data.length; index += 4) {
      peak = Math.max(peak, image.data[index], image.data[index + 1], image.data[index + 2])
    }
    expect(Number.isFinite(peak)).toBe(true)
    expect(peak).toBeGreaterThan(1)
    expect(studio.background).toBe(false)
  })
})
