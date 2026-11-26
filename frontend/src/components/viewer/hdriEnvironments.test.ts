import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FloatType } from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { describe, expect, it } from 'vitest'
import { HDRI_ENVIRONMENTS } from './hdriEnvironments'

describe('viewer HDRI assets', () => {
  it.each(HDRI_ENVIRONMENTS)('ships a decodable, browser-sized $label panorama', ({ hdrPath }) => {
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

  it('paints the Custom HDRI sun as one huge round dish in front (+Z), without blowing out', () => {
    const bytes = readFileSync(resolve('public', 'hdri/custom-hdri.hdr'))
    const { width, height, data } = new HDRLoader().setDataType(FloatType).parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    )
    if (!data || !width || !height) throw new Error('No HDR pixel data in custom-hdri.hdr')
    // Radiance at an azimuth (0 = +Z, positive toward +X) and elevation, both in degrees.
    // u = atan2(z, x) / 2pi + 0.5, so +Z is u = 0.75; row 0 is straight up.
    const radiance = (azimuth: number, elevation: number) => {
      const u = (0.75 + azimuth / 360 + 1) % 1
      const v = 0.5 - elevation / 180
      return data[(Math.floor(v * height) * width + Math.floor(u * width)) * 4]
    }
    const floor = radiance(0, -85)
    expect(floor).toBeGreaterThan(0.2)
    expect(floor).toBeLessThan(0.7)

    // The dish is centred just above the horizon on +Z and strong right in front of the model.
    expect(radiance(0, 12)).toBeGreaterThan(floor * 3)
    // It is huge: from the side it still reaches well above the model and below its base.
    expect(radiance(0, 55)).toBeGreaterThan(floor * 2)
    expect(radiance(0, -30)).toBeGreaterThan(floor * 3)
    expect(radiance(40, 12)).toBeGreaterThan(floor * 2)
    // It stays in front: the opposite side is just the room.
    expect(radiance(180, 45)).toBeLessThan(floor * 3)
    // Nothing is blown out: the brightest pixel stays within a sensible studio range.
    let peak = 0
    for (let index = 0; index < data.length; index += 4) peak = Math.max(peak, data[index])
    expect(peak).toBeLessThan(4)
  })
})
