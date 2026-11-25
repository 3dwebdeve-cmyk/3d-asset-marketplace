// Generates public/hdri/custom-hdri.hdr: a light grey-white photo studio with one very large,
// soft, round "sun" in front of the subject: a concave dish that curves around it.
//
//   node scripts/make_custom_hdri.mjs [output.hdr]
//
// Conventions (match three.js equirect sampling, before environmentRotation):
//   u = atan2(dir.z, dir.x) / 2pi + 0.5   v = asin(dir.y) / pi + 0.5   (row 0 = zenith)
// The sun is placed on +Z, so rotating the environment by yaw puts it at
// (sin yaw, ., cos yaw) - the same convention PreviewModel uses for its key light.
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WIDTH = 1024
const HEIGHT = 512

const deg = (value) => (value * Math.PI) / 180
const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
const lerp = (a, b, t) => a + (b - a) * t

// Linear radiance. The room is a pale studio cyclorama; the viewer lifts the
// background separately, so these numbers only decide how the model is lit.
const STUDIO = {
  horizon: 0.41, // walls and floor meet here with no visible edge
  ceiling: 0.5, // room radiance straight up
  floorDown: 0.3, // floor radiance straight down (keeps the plane grounded)
}

// The "sun" is one huge, soft, round light in front of the model, like a concave dish that curves around
// it. Seen from the side it spans from high above the model down below its base, centred just above the
// horizon, with its light pointing in at the model from every height. In an HDRI that is simply a very
// large disc: the bigger its radius, the more the light wraps around the model. Raising `radiance`
// lights everything more but brightens white products too, so keep it modest.
const SUN = {
  elevation: deg(20), // height of the centre of the disc (keep close to keyElevation in hdriEnvironments.ts)
  coreRadius: deg(34), // flat, full-strength part of the disc
  edgeRadius: deg(60), // the light has faded to nothing by here (the disc reaches about +80 / -40 degrees)
  radiance: 3.0, // linear radiance of the disc
}

function angleBetween(a, b) {
  return Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
}

function direction(azimuth, elevation) {
  // azimuth 0 = +Z, positive turns toward +X (so it equals the "yaw" used by the viewer).
  return [Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth)]
}

const sunDirection = direction(0, SUN.elevation)

function sunRadiance(dir) {
  const angle = angleBetween(dir, sunDirection)
  return SUN.radiance * (1 - smoothstep(SUN.coreRadius, SUN.edgeRadius, angle))
}

// Cheap deterministic noise (about +/-0.3%) so smooth gradients do not band in 8-bit RGBE.
function noise(x, y) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295 - 0.5
}

function radianceAt(x, y) {
  const lon = ((x + 0.5) / WIDTH - 0.5) * 2 * Math.PI
  const elevation = (0.5 - (y + 0.5) / HEIGHT) * Math.PI
  const dir = [Math.cos(elevation) * Math.cos(lon), Math.sin(elevation), Math.cos(elevation) * Math.sin(lon)]

  const up = Math.sin(elevation)
  const base = up >= 0
    ? lerp(STUDIO.horizon, STUDIO.ceiling, up)
    : lerp(STUDIO.horizon, STUDIO.floorDown, -up)

  const value = base + sunRadiance(dir)
  return value * (1 + noise(x, y) * 0.006)
}

function encodeRgbe(r, g, b) {
  const peak = Math.max(r, g, b)
  if (peak < 1e-32) return [0, 0, 0, 0]
  const exponent = Math.ceil(Math.log2(peak * (1 + 1e-9)))
  const scale = 256 / 2 ** exponent
  return [
    Math.min(255, Math.floor(r * scale)),
    Math.min(255, Math.floor(g * scale)),
    Math.min(255, Math.floor(b * scale)),
    exponent + 128,
  ]
}

// New-style run-length encoding, one channel at a time (what Radiance and three.js expect).
function encodeChannel(values) {
  const out = []
  let i = 0
  while (i < values.length) {
    let run = 1
    while (i + run < values.length && values[i + run] === values[i] && run < 127) run++
    if (run >= 4) {
      out.push(128 + run, values[i])
      i += run
      continue
    }
    const start = i
    let count = 0
    while (i < values.length && count < 128) {
      let ahead = 1
      while (i + ahead < values.length && values[i + ahead] === values[i] && ahead < 4) ahead++
      if (ahead >= 4) break
      i++
      count++
    }
    out.push(count, ...values.slice(start, start + count))
  }
  return out
}

const header = Buffer.from(`#?RADIANCE\n# Custom HDRI: light grey-white studio, large soft key\nFORMAT=32-bit_rle_rgbe\n\n-Y ${HEIGHT} +X ${WIDTH}\n`, 'ascii')
const chunks = [header]
for (let y = 0; y < HEIGHT; y++) {
  const channels = [[], [], [], []]
  for (let x = 0; x < WIDTH; x++) {
    const value = radianceAt(x, y)
    const rgbe = encodeRgbe(value, value, value)
    for (let c = 0; c < 4; c++) channels[c].push(rgbe[c])
  }
  const line = [2, 2, WIDTH >> 8, WIDTH & 255]
  for (const channel of channels) line.push(...encodeChannel(channel))
  chunks.push(Buffer.from(line))
}

const target = resolve(
  process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '../public/hdri/custom-hdri.hdr'),
)
const file = Buffer.concat(chunks)
writeFileSync(target, file)
console.log(`${target} (${file.length} bytes)`)
