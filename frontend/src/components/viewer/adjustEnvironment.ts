import { DataTexture, DataUtils, HalfFloatType, MathUtils, RGBAFormat, type Texture } from 'three'

export const DEFAULT_ENVIRONMENT_ADJUSTMENTS = {
  contrast: 0,
  exposure: 0,
  saturation: 0,
  highlights: 0,
  shadows: 0,
  gamma: 0,
  sharpness: 0,
}

export type EnvironmentAdjustments = typeof DEFAULT_ENVIRONMENT_ADJUSTMENTS

export function adjustEnvironment(source: Texture, adjustments: EnvironmentAdjustments): Texture {
  const { contrast, exposure, saturation, highlights, shadows, gamma, sharpness } = adjustments
  if (Object.values(adjustments).every((value) => value === 0)) return source
  if (!(source instanceof DataTexture) || source.type !== HalfFloatType || source.format !== RGBAFormat) return source

  const { data, width, height } = source.image
  if (!(data instanceof Uint16Array) || data.length !== width * height * 4) return source

  const pixels = new Uint16Array(data.length)
  const gain = 1 + contrast / 100
  const exposureGain = 2 ** exposure
  const colorGain = 1 + saturation / 100
  const inverseGamma = 1 / (1 + gamma)
  const detail = sharpness * (sharpness < 0 ? 0.008 : 0.0035)
  const step = Math.max(1, Math.round(width / 256))
  const decode = DataUtils.fromHalfFloat
  const rgb = [0, 0, 0]
  for (let y = 0; y < height; y++) {
    const above = Math.max(0, y - step) * width
    const below = Math.min(height - 1, y + step) * width
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = (row + x) * 4
      const left = (row + (x + width - step) % width) * 4
      const right = (row + (x + step) % width) * 4
      const top = (above + x) * 4
      const bottom = (below + x) * 4
      for (let channel = 0; channel < 3; channel++) {
        const original = decode(data[i + channel])
        const softened = detail === 0 ? original : (
          decode(data[left + channel]) + decode(data[right + channel])
          + decode(data[top + channel]) + decode(data[bottom + channel])
        ) / 4
        rgb[channel] = Math.max(0, original + (original - softened) * detail) * exposureGain
      }
      const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
      // Work in linear HDR space and preserve values above the SDR white point.
      let tone = Math.max(0, (luminance - 0.5) * gain + 0.5)
      if (highlights !== 0 || shadows !== 0) {
        const highlightWeight = MathUtils.smoothstep(luminance, 0.35, 1)
        const shadowWeight = 1 - MathUtils.smoothstep(luminance, 0, 0.55)
        tone *= 2 ** ((highlights * highlightWeight + shadows * shadowWeight) / 100)
      }
      if (inverseGamma !== 1 && tone < 1) tone **= inverseGamma
      const multiplier = luminance > 0 ? tone / luminance : 0
      for (let channel = 0; channel < 3; channel++) {
        const color = luminance > 0 ? (luminance + (rgb[channel] - luminance) * colorGain) * multiplier : tone
        pixels[i + channel] = DataUtils.toHalfFloat(MathUtils.clamp(color, 0, 65504))
      }
      pixels[i + 3] = data[i + 3]
    }
  }

  const texture = new DataTexture(pixels, width, height, source.format, source.type)
  texture.mapping = source.mapping
  texture.colorSpace = source.colorSpace
  texture.flipY = source.flipY
  texture.needsUpdate = true
  return texture
}
