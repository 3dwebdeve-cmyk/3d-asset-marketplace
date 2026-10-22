import { existsSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  CATEGORY_BANNER_BY_SLUG,
  HERO_BANNER_WIDTHS,
  HERO_VARIANT_WIDTHS,
  SITE_HERO_IMAGE_SRC,
  heroBannerForPath,
  heroPreloadLink,
  heroSrcSet,
  heroVariantPath,
} from './heroBanners'

const onDisk = (url: string) => join('public', decodeURIComponent(url.split('?')[0]))

describe('hero banners', () => {
  it('lists the real width of every banner, and its smaller copies exist', async () => {
    for (const [url, width] of Object.entries(HERO_BANNER_WIDTHS)) {
      expect((await sharp(onDisk(url)).metadata()).width, url).toBe(width)
      for (const copy of HERO_VARIANT_WIDTHS.filter((w) => w < width)) {
        expect(existsSync(onDisk(heroVariantPath(url, copy))), `${url} @${copy}`).toBe(true)
      }
    }
  })

  it('gives every page and category banner smaller copies', () => {
    for (const src of [...Object.values(CATEGORY_BANNER_BY_SLUG), SITE_HERO_IMAGE_SRC]) {
      expect(heroSrcSet(src), src).toBeDefined()
    }
  })

  it('keeps the version query on every copy', () => {
    expect(heroSrcSet('/images/contact-hero.webp?v=2')).toBe(
      '/images/contact-hero-768.webp?v=2 768w, /images/contact-hero-1280.webp?v=2 1280w, ' +
        '/images/contact-hero-1920.webp?v=2 1920w, /images/contact-hero.webp?v=2 2400w',
    )
  })

  it('finds the banner from the address alone', () => {
    expect(heroBannerForPath('/3d-models/toys')).toBe(CATEGORY_BANNER_BY_SLUG.toys)
    expect(heroBannerForPath('/3d-models/Furniture')).toBe(CATEGORY_BANNER_BY_SLUG.furniture)
    expect(heroBannerForPath('/3d-models/not-a-category')).toBe(SITE_HERO_IMAGE_SRC)
    expect(heroBannerForPath('/cart')).toBeUndefined()
  })

  it('preloads with the same srcset and sizes the <img> uses', () => {
    const src = CATEGORY_BANNER_BY_SLUG.toys
    expect(heroPreloadLink('/3d-models/toys')).toBe(
      `<${src}>; rel=preload; as=image; fetchpriority=high; imagesrcset="${heroSrcSet(src)}"; imagesizes="100vw"`,
    )
  })
})
