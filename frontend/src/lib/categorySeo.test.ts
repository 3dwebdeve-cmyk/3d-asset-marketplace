import { describe, expect, it } from 'vitest'

import {
  ALL_MODELS_SEO,
  NOINDEX_CATEGORY_SLUGS,
  buildCategoryTitle,
  categoryPath,
  getCategorySeo,
} from './categorySeo'

const KNOWN_SLUGS = [
  'furniture',
  'interior-3d-models',
  'household',
  'lights',
  'plants-vegetation',
  'lifestyle-visualisation',
  'lifestyle-visualization',
  'products',
  'architectural-3d-models',
  'interactive-webar',
  'electronics',
  'food-drink',
  'toys',
  'character',
  'assets-props',
  'cloth-items',
  '3d-printing',
  'industrial',
]

describe('category addresses', () => {
  it('builds a readable address from the slug', () => {
    expect(categoryPath('furniture')).toBe('/3d-models/furniture')
    expect(categoryPath('  Interior-3D-Models ')).toBe('/3d-models/interior-3d-models')
    expect(categoryPath('a b/c')).toBe('/3d-models/a%20b%2Fc')
  })
})

describe('category copy', () => {
  it.each(KNOWN_SLUGS)('%s has a complete, search-friendly set of copy', (slug) => {
    const copy = getCategorySeo(slug, 'Name')
    const title = buildCategoryTitle(copy)

    expect(copy.h1.length).toBeGreaterThan(5)
    expect(title.endsWith('| AssetHive3D')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(66)
    expect(copy.description.length).toBeGreaterThan(50)
    expect(copy.description.length).toBeLessThanOrEqual(160)
    expect(copy.intro.length).toBeGreaterThan(40)
    expect(copy.indexable).toBe(true)
  })

  it('gives every category its own title, description and heading, so pages never read alike', () => {
    const slugs = KNOWN_SLUGS.filter((slug) => slug !== 'lifestyle-visualization')
    const copies = slugs.map((slug) => getCategorySeo(slug, 'Name'))
    for (const field of ['title', 'h1', 'description', 'intro'] as const) {
      expect(new Set(copies.map((copy) => copy[field])).size).toBe(slugs.length)
    }
  })

  it('names the thing it is about in the first words of the title', () => {
    expect(getCategorySeo('furniture', 'Furniture').title).toMatch(/^Furniture 3D Models/)
    expect(getCategorySeo('interior-3d-models', 'Interior 3D Models').title).toMatch(/^Interior 3D Models/)
    expect(getCategorySeo('lights', 'Lights').title).toMatch(/^Lighting 3D Models/)
    expect(getCategorySeo('plants-vegetation', 'Plants').title).toMatch(/^Plant 3D Models/)
  })

  it('never makes a claim the shop cannot prove', () => {
    const everything = [
      ...KNOWN_SLUGS.map((slug) => getCategorySeo(slug, 'Name')),
      getCategorySeo('made-up-later', 'Garden Tools'),
    ]
      .flatMap((copy) => [copy.title, copy.h1, copy.description, copy.intro])
      .concat(ALL_MODELS_SEO.title, ALL_MODELS_SEO.h1, ALL_MODELS_SEO.description, ALL_MODELS_SEO.intro)
      .join(' ')

    // The shop has no free downloads and no ranking or size to boast about.
    expect(everything).not.toMatch(/\bfree\b|\bbest\b|\blargest\b|\b#1\b|\bcheapest\b|\bunlimited\b|\bguarantee/i)
  })

  it('still produces a sensible page for a category added later', () => {
    const copy = getCategorySeo('garden-tools', 'Garden Tools')
    expect(copy.h1).toBe('Garden Tools 3D Models')
    expect(copy.description).toContain('Garden Tools 3D models')
    expect(copy.indexable).toBe(true)
  })

  it('keeps placeholder categories out of search results', () => {
    expect(NOINDEX_CATEGORY_SLUGS.has('demo-assets')).toBe(true)
    expect(getCategorySeo('demo-assets', 'Demo Assets').indexable).toBe(false)
  })

  it('has a headline for the all-models page that says what the shop sells', () => {
    expect(ALL_MODELS_SEO.h1).toBe('3D Models for Furniture, Interiors & Visualization')
    expect(ALL_MODELS_SEO.description.length).toBeLessThanOrEqual(160)
  })
})
