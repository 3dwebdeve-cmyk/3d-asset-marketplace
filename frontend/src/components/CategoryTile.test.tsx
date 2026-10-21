import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { CategoryPublic } from '../types/category'
import {
  CATEGORY_IMAGE_WIDTHS,
  LOCAL_CATEGORY_IMAGES,
  resizedCategoryImage,
  responsiveImageProps,
} from './categoryImages'
import { CategoryTile } from './CategoryTile'

function category(slug: string, image: string | null = null): CategoryPublic {
  return { id: slug, name: slug, slug, image } as unknown as CategoryPublic
}

describe('category images', () => {
  it('names the resized copies next to the original', () => {
    expect(resizedCategoryImage('/catego%20image/Sofa.webp', 640)).toBe('/catego%20image/Sofa-640.webp')
    expect(resizedCategoryImage('/x/household.webp?v=2', 1000)).toBe('/x/household-1000.webp')
  })

  it('has every resized copy in public/, so no card can show a broken image', () => {
    // Vite lists the files that exist at build time; the keys look like ../../public/<file>.
    const onDisk = new Set(Object.keys(import.meta.glob('../../public/**/*.webp', { eager: false })))
    expect(onDisk.size).toBeGreaterThan(30) // the listing itself works
    const missing: string[] = []
    for (const source of Object.values(LOCAL_CATEGORY_IMAGES)) {
      for (const width of CATEGORY_IMAGE_WIDTHS) {
        const file = `../../public${decodeURIComponent(resizedCategoryImage(source, width))}`
        if (!onDisk.has(file)) missing.push(file)
      }
    }
    expect(missing).toEqual([])
  })

  it('lets the browser choose between the sizes for a local image', () => {
    const props = responsiveImageProps('/catego%20image/Sofa.webp', true)

    expect(props.src).toBe('/catego%20image/Sofa-1000.webp')
    expect(props.srcSet).toBe('/catego%20image/Sofa-640.webp 640w, /catego%20image/Sofa-1000.webp 1000w')
    expect(props.sizes).toContain('vw')
  })

  it('uses an image from the API as it is', () => {
    expect(responsiveImageProps('https://cdn.example/x.webp', false)).toEqual({ src: 'https://cdn.example/x.webp' })
  })
})

describe('CategoryTile image', () => {
  it('renders a local category with both sizes and reserved dimensions', () => {
    const { container } = render(
      <MemoryRouter>
        <CategoryTile category={category('furniture')} />
      </MemoryRouter>,
    )
    const img = container.querySelector('img')!

    expect(img.getAttribute('src')).toMatch(/-1000\.webp$/)
    expect(img.getAttribute('srcset')).toMatch(/-640\.webp 640w, .*-1000\.webp 1000w$/)
    expect(img.getAttribute('width')).toBe('1000')
    expect(img.getAttribute('height')).toBe('566')
  })

  it('renders an unknown category with its own image and no srcset', () => {
    const { container } = render(
      <MemoryRouter>
        <CategoryTile category={category('brand-new', 'https://cdn.example/brand-new.webp')} />
      </MemoryRouter>,
    )
    const img = container.querySelector('img')!

    expect(img.getAttribute('src')).toBe('https://cdn.example/brand-new.webp')
    expect(img.getAttribute('srcset')).toBeNull()
  })
})
