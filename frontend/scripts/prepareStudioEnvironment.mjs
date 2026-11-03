import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DataTexture, FloatType, HalfFloatType, RGBAFormat } from 'three'
import { EXRLoader } from 'three-stdlib'
import { EXRExporter } from 'three/addons/exporters/EXRExporter.js'

// Keep the supplied 4K master intact. Browser environment-map convolution needs
// a smaller texture, especially on software-rendered browsers and mobile GPUs.
const sourcePath = new URL('../public/hdri/studio_small_09_4k.exr', import.meta.url)
const outputPath = new URL('../public/hdri/studio_small_09_1k.exr', import.meta.url)
const bytes = readFileSync(sourcePath)
const loader = new EXRLoader().setDataType(FloatType)
const source = loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
const width = 1024
const height = 512
const scaleX = source.width / width
const scaleY = source.height / height
if (!Number.isInteger(scaleX) || !Number.isInteger(scaleY) || scaleX < 1 || scaleY < 1) {
  throw new Error('Expected a source panorama that is an integer multiple of 1024 x 512.')
}

// Average scene-linear radiance, never tone-map to an 8-bit display image:
// highlights must continue to illuminate and reflect off the product correctly.
const pixels = new Float32Array(width * height * 4)
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const target = (y * width + x) * 4
    for (let dy = 0; dy < scaleY; dy++) {
      for (let dx = 0; dx < scaleX; dx++) {
        const index = ((y * scaleY + dy) * source.width + x * scaleX + dx) * 4
        for (let channel = 0; channel < 3; channel++) {
          pixels[target + channel] += source.data[index + channel] / (scaleX * scaleY)
        }
      }
    }
    pixels[target + 3] = 1
  }
}

const texture = new DataTexture(pixels, width, height, RGBAFormat, FloatType)
const exported = await new EXRExporter().parse(texture, { type: HalfFloatType })
const decoded = loader.parse(exported.buffer.slice(exported.byteOffset, exported.byteOffset + exported.byteLength))
if (decoded.width !== width || decoded.height !== height) throw new Error('Invalid output dimensions.')
let peak = 0
for (let index = 0; index < pixels.length; index++) {
  const actual = decoded.data[index]
  if (!Number.isFinite(actual) || Math.abs(actual - pixels[index]) > Math.max(0.002, Math.abs(pixels[index]) * 0.002)) {
    throw new Error('EXR round trip changed the panorama orientation or radiance.')
  }
  if (index % 4 !== 3) peak = Math.max(peak, actual)
}
if (peak <= 1) throw new Error('Output lost its high dynamic range.')
writeFileSync(outputPath, exported)
texture.dispose()
console.log(`Prepared ${fileURLToPath(outputPath)}: ${width} x ${height}, ${exported.length} bytes; HDR peak ${peak}.`)
