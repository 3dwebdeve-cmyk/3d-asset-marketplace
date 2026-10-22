// Make the smaller WebP copies of every hero banner listed in src/lib/heroBanners.ts.
// Run from frontend/ after adding or replacing a banner:  node scripts/makeBannerSizes.ts
import { stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { HERO_BANNER_WIDTHS, HERO_VARIANT_WIDTHS, heroVariantPath } from '../src/lib/heroBanners.ts'

const publicDir = path.resolve('public')
const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`

for (const [url, expectedWidth] of Object.entries(HERO_BANNER_WIDTHS)) {
  const file = path.join(publicDir, decodeURIComponent(url))
  const { width } = await sharp(file).metadata()
  if (width !== expectedWidth) {
    console.warn(`! ${url} is ${width} px wide; update HERO_BANNER_WIDTHS (says ${expectedWidth})`)
  }
  const sizes = [`${kb((await stat(file)).size)} @${width}`]
  for (const target of HERO_VARIANT_WIDTHS.filter((w) => w < (width ?? 0))) {
    const out = path.join(publicDir, decodeURIComponent(heroVariantPath(url, target)))
    const info = await sharp(file).resize({ width: target }).webp({ quality: 80, effort: 6 }).toFile(out)
    sizes.push(`${kb(info.size)} @${target}`)
  }
  console.log(`${decodeURIComponent(url)}: ${sizes.join(', ')}`)
}
