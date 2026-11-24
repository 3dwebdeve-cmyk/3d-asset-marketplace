import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FloatType } from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { describe, expect, it } from 'vitest'
import { HDRI_ENVIRONMENTS } from './hdriEnvironments'

describe('viewer HDRI assets', () => {
  it.each(HDRI_ENVIRONMENTS.filter((preset) => preset.hdrPath !== null))('ships a decodable, browser-sized $label panorama', ({ hdrPath }) => {
    const bytes = readFileSync(resolve('public', hdrPath.slice(1)))
    const { width, height, data } = new HDRLoader().setDataType(FloatType).parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    )
    expect(width).toBe(1024)
    expect(height).toBe(512)
    expect(bytes.length).toBeLessThan(2.1 * 1024 * 1024)
    if (!data) throw new Error(`No HDR pixel data in ${hdrPath}`)
    let peak = 0
    for (let index = 0; index < data.length; index += 4) {
      peak = Math.max(peak, data[index], data[index + 1], data[index + 2])
    }
    expect(Number.isFinite(peak)).toBe(true)
    expect(peak).toBeGreaterThan(1)
  })
})
