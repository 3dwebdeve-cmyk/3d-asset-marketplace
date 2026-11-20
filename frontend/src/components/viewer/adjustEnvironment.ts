import { DataTexture, DataUtils, HalfFloatType, RGBAFormat, type Texture } from 'three'

export function adjustEnvironment(source: Texture, contrast: number, sharpness: number): Texture {
  if (contrast === 100 && sharpness === 100) return source
  if (!(source instanceof DataTexture) || source.type !== HalfFloatType || source.format !== RGBAFormat) return source

  const { data, width, height } = source.image
  if (!(data instanceof Uint16Array) || data.length !== width * height * 4) return source

  const pixels = new Uint16Array(data.length)
  const gain = contrast / 100
  const softness = (100 - sharpness) / 100
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
        const softened = softness === 0 ? original : (
          decode(data[left + channel]) + decode(data[right + channel])
          + decode(data[top + channel]) + decode(data[bottom + channel])
        ) / 4
        rgb[channel] = original + (softened - original) * softness * 0.8
      }
      const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
      const multiplier = luminance > 0 ? Math.max(0, (luminance - 0.5) * gain + 0.5) / luminance : 0
      for (let channel = 0; channel < 3; channel++) {
        pixels[i + channel] = DataUtils.toHalfFloat(Math.min(65504, rgb[channel] * multiplier))
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
