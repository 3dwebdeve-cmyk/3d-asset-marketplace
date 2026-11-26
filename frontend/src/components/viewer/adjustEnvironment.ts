import { DataTexture, DataUtils, HalfFloatType, MathUtils, RGBAFormat, type Texture } from 'three'

export const DEFAULT_ENVIRONMENT_ADJUSTMENTS = {
  contrast: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  gamma: 0,
}

export type EnvironmentAdjustments = typeof DEFAULT_ENVIRONMENT_ADJUSTMENTS

export function adjustEnvironment(source: Texture, adjustments: EnvironmentAdjustments): Texture {
  const { contrast, exposure, highlights, shadows, gamma } = adjustments
  if (Object.values(adjustments).every((value) => value === 0)) return source
  if (!(source instanceof DataTexture) || source.type !== HalfFloatType || source.format !== RGBAFormat) return source

  const { data, width, height } = source.image
  if (!(data instanceof Uint16Array) || data.length !== width * height * 4) return source

  const pixels = new Uint16Array(data.length)
  const gain = 1 + contrast / 100
  const exposureGain = 2 ** exposure
  const inverseGamma = 1 / (1 + gamma)
  const decode = DataUtils.fromHalfFloat
  const rgb = [0, 0, 0]
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = (row + x) * 4
      for (let channel = 0; channel < 3; channel++) {
        rgb[channel] = Math.max(0, decode(data[i + channel])) * exposureGain
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
        const color = luminance > 0 ? rgb[channel] * multiplier : tone
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
