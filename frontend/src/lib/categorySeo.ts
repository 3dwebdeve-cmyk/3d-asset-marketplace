import { buildPageTitle } from './seo'

export interface CategorySeoCopy {
  /** Page title without the brand suffix. */
  title: string
  /** Visible heading (the page's single H1). */
  h1: string
  /** Meta description, kept under about 160 characters. */
  description: string
  /** Visible introduction under the heading; unique per category so pages do not read alike. */
  intro: string
  /** False for placeholder categories that should stay out of search results. */
  indexable: boolean
}

const BUY_LINE = 'Preview in 3D, secure checkout and instant download after purchase.'

interface Entry {
  title: string
  h1?: string
  description: string
  intro: string
}

const FURNITURE_AND_INTERIOR: Record<string, Entry> = {
  furniture: {
    title: 'Furniture 3D Models – Chairs, Sofas & Tables',
    h1: 'Furniture 3D Models',
    description:
      'Furniture 3D models for interior design, visualization and AR: chairs, sofas and tables. ' + BUY_LINE,
    intro:
      'Ready-to-use furniture 3D models for interior renders, architectural visualization, product viewers and real-time scenes. ' +
      'Preview each model in 3D before you buy, check the polygon count, formats and license on its page, and download your files right after checkout.',
  },
  'interior-3d-models': {
    title: 'Interior 3D Models – Rooms, Décor & Scenes',
    h1: 'Interior 3D Models',
    description: 'Interior 3D models for rooms, décor and visualization scenes. ' + BUY_LINE,
    intro:
      'Build believable interiors faster with 3D models made for visualization and design work. ' +
      'Filter by software and format, compare license types, and turn each model around in your browser before you decide.',
  },
  household: {
    title: 'Household 3D Models – Home Décor & Everyday Objects',
    h1: 'Household 3D Models',
    description: 'Household 3D models: everyday objects and décor for interior scenes and visualization. ' + BUY_LINE,
    intro:
      'The small things that make a scene feel lived in: everyday household objects and home décor, modeled for interior renders and product visualization. ' +
      'Every listing shows its formats and license before you buy.',
  },
  lights: {
    title: 'Lighting 3D Models – Lamps, Pendants & Fixtures',
    h1: 'Lighting 3D Models',
    description: 'Lighting 3D models: lamps, pendants and fixtures for interior visualization. ' + BUY_LINE,
    intro:
      'Lamps, pendants and fixtures for interior visualization and design scenes. ' +
      'Check each model in 3D, see its polygon count and file formats, and download it as soon as your order is paid.',
  },
  'plants-vegetation': {
    title: 'Plant 3D Models – Indoor Plants & Vegetation',
    h1: 'Plant 3D Models',
    description: 'Plant and vegetation 3D models for interiors, exteriors and visualization scenes. ' + BUY_LINE,
    intro:
      'Indoor plants and vegetation to bring interior and exterior scenes to life. ' +
      'Preview each plant in 3D, compare formats and licenses, and download straight after checkout.',
  },
  'lifestyle-visualisation': {
    title: 'Lifestyle Visualization 3D Models',
    description: 'Lifestyle and visualization 3D models for styled interior scenes and marketing renders. ' + BUY_LINE,
    intro:
      'Models for styled, lived-in scenes and marketing renders. ' +
      'Preview each one in 3D and check its formats and license on the product page.',
  },
}
FURNITURE_AND_INTERIOR['lifestyle-visualization'] = FURNITURE_AND_INTERIOR['lifestyle-visualisation']

const OTHER_CATEGORIES: Record<string, Entry> = {
  products: {
    title: 'Product 3D Models for Visualization & E-commerce',
    h1: 'Product 3D Models',
    description: 'Product 3D models for visualization, advertising and e-commerce viewers. ' + BUY_LINE,
    intro:
      'Models of everyday products for packshots, advertising and interactive product viewers. ' +
      'Check formats, polygon counts and the license on each listing before you buy.',
  },
  'architectural-3d-models': {
    title: 'Architectural 3D Models for Visualization',
    h1: 'Architectural 3D Models',
    description: 'Architectural 3D models for visualization and design presentations. ' + BUY_LINE,
    intro:
      'Architectural 3D models for visualization and design presentations. ' +
      'Filter by software and format, and preview each model in 3D first.',
  },
  'interactive-webar': {
    title: 'Interactive & WebAR 3D Models',
    h1: 'Interactive 3D & WebAR Models',
    description: '3D models for interactive web viewers and AR experiences. ' + BUY_LINE,
    intro:
      'Models for interactive web viewers and AR experiences. ' +
      'Each listing shows its formats and polygon count so you can judge how it will perform.',
  },
  electronics: {
    title: 'Electronics 3D Models',
    description: 'Electronics 3D models for product visualization and design scenes. ' + BUY_LINE,
    intro: 'Electronics and gadgets modeled for product visualization and design scenes.',
  },
  'food-drink': {
    title: 'Food & Drink 3D Models',
    description: 'Food and drink 3D models for visualization, packaging and advertising scenes. ' + BUY_LINE,
    intro: 'Food and drink models for visualization, packaging mockups and advertising scenes.',
  },
  toys: {
    title: 'Toy 3D Models',
    description: 'Toy 3D models for product visualization and games. ' + BUY_LINE,
    intro: 'Toy models for product visualization, games and playful scenes.',
  },
  character: {
    title: 'Character 3D Models',
    description: 'Character 3D models for games, animation and visualization. ' + BUY_LINE,
    intro: 'Character models for games, animation and visualization. Filter for rigged or animated assets.',
  },
  'assets-props': {
    title: 'Props & Assets 3D Models',
    h1: 'Props & Assets 3D Models',
    description: 'Props and assets 3D models for games, film and visualization scenes. ' + BUY_LINE,
    intro: 'Props and assets for games, film and visualization scenes.',
  },
  'cloth-items': {
    title: 'Clothing & Cloth 3D Models',
    h1: 'Clothing 3D Models',
    description: 'Clothing and cloth item 3D models for visualization and games. ' + BUY_LINE,
    intro: 'Clothing and cloth items for visualization, games and character work.',
  },
  '3d-printing': {
    title: '3D Printing Models',
    h1: '3D Printing Models',
    description: '3D printing models ready to download after purchase. Check formats and the license on each listing.',
    intro: 'Models for 3D printing. Each listing shows its file formats and license so you know what you are getting.',
  },
  industrial: {
    title: 'Industrial 3D Models',
    description: 'Industrial 3D models for visualization and design scenes. ' + BUY_LINE,
    intro: 'Industrial models for visualization and design scenes.',
  },
}

/** Placeholder content that should never appear in search results. */
export const NOINDEX_CATEGORY_SLUGS: ReadonlySet<string> = new Set(['demo-assets'])

/** The readable address of a category page, e.g. /3d-models/furniture. */
export function categoryPath(slug: string): string {
  return `/3d-models/${encodeURIComponent(slug.trim().toLowerCase())}`
}

export function getCategorySeo(slug: string, name: string): CategorySeoCopy {
  const entry = FURNITURE_AND_INTERIOR[slug] ?? OTHER_CATEGORIES[slug]
  const indexable = !NOINDEX_CATEGORY_SLUGS.has(slug)
  if (entry) {
    return {
      title: entry.title,
      h1: entry.h1 ?? entry.title.split(' – ')[0],
      description: entry.description,
      intro: entry.intro,
      indexable,
    }
  }
  // Any category added later still gets a sensible, accurate page.
  return {
    title: `${name} 3D Models`,
    h1: `${name} 3D Models`,
    description: `Browse ${name} 3D models. ${BUY_LINE}`,
    intro: `Browse ${name} 3D models, filter by software and format, and preview each one in 3D before you buy.`,
    indexable,
  }
}

export function buildCategoryTitle(copy: CategorySeoCopy): string {
  return buildPageTitle(copy.title)
}

export const ALL_MODELS_SEO = {
  title: '3D Models for Furniture, Interiors & Visualization',
  h1: '3D Models for Furniture, Interiors & Visualization',
  description:
    'Browse 3D models for furniture, interiors, lighting, plants and product visualization. ' + BUY_LINE,
  intro:
    'Browse production-ready 3D models by category, software and format. ' +
    'Start with furniture and interior pieces, or explore household objects, lighting, plants and product models.',
} as const
