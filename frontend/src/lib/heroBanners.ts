// The wide pictures at the top of pages. The pages show them and the Worker (worker/index.ts)
// preloads the same one, so the browser starts fetching it together with the page.

export const SITE_HERO_IMAGE_SRC = '/images/site-hero-banner.webp?v=9'
export const PLUGINS_HERO_IMAGE_SRC = '/images/Floating%20Plugin%20Interface%20Tiles.webp'
export const MODELS_HERO_IMAGE_SRC = '/images/new%20size/3d-model.webp'
export const CUSTOM_PROJECTS_HERO_IMAGE_SRC = '/images/CUSTOM%20PROJECTS.webp'
export const CONTACT_HERO_IMAGE_SRC = '/images/contact-hero.webp?v=2'
export const ABOUT_HERO_IMAGE_SRC = '/images/new%20size/contact-page.webp'

export const PRODUCTS_BANNER_IMAGE_SRC = '/images/new%20banner%20image%20size/Moody%20Luxury%20Skincare%20Collection.webp'
export const CATEGORY_BANNER_BY_SLUG: Readonly<Record<string, string>> = {
  furniture: '/banner%20image/08.webp',
  toys: '/images/new%20banner%20image%20size/Wooden%20Train%20and%20Rainbow%20Toys%20on%20NavyBackdrop.webp',
  electronics: '/images/new%20banner%20image%20size/Electronics.webp',
  'food-drink': '/images/new%20banner%20image%20size/Food%20&%20Drink.webp',
  character: '/images/new%20banner%20image%20size/Character.webp',
  industrial: '/images/new%20banner%20image%20size/Industrial.webp',
  '3d-printing': '/images/new%20banner%20image%20size/3D%20Printing.webp',
  'assets-props': '/images/new%20banner%20image%20size/Assets%20%20Props.webp',
  'interactive-webar': '/images/new%20banner%20image%20size/AR%20Armchair%20Studio%20Showcase.webp?v=2',
  'architectural-3d-models': '/images/new%20banner%20image%20size/Architectural%203D%20Models.webp',
  'interior-3d-models': '/images/new%20banner%20image%20size/Cinematic%20Floating%20Pavilion%20Interior.webp',
  'cloth-items': '/images/new%20banner%20image%20size/Cloth%20Items.webp',
  household: '/images/new%20banner%20image%20size/Household.webp',
  'lifestyle-visualisation': '/images/new%20banner%20image%20size/Moody%20Minimalist%20Sofa%20Nook.webp',
  'lifestyle-visualization': '/images/new%20banner%20image%20size/Moody%20Minimalist%20Sofa%20Nook.webp',
  lights: '/images/new%20banner%20image%20size/Moody%20Modern%20Lighting%20Vignette.webp',
  'plants-vegetation': '/images/new%20banner%20image%20size/Moody%20Panoramic%20Indoor%20Plant%20Collection.webp',
  products: PRODUCTS_BANNER_IMAGE_SRC,
}

/** A category without its own picture shows the site banner. */
export function categoryBanner(slug: string): string {
  return CATEGORY_BANNER_BY_SLUG[slug] ?? SITE_HERO_IMAGE_SRC
}

/** The `sizes` every hero image uses; a preload must say the same or the browser fetches twice. */
export const HERO_IMAGE_SIZES = '100vw'

// Smaller copies sit next to each banner as <name>-768.webp and so on, made by
// `node scripts/makeBannerSizes.ts`. Phones then download a fraction of the full picture.
export const HERO_VARIANT_WIDTHS = [768, 1280, 1920] as const

// Pixel width of each original (without ?v=), so the browser can choose between the copies.
// A test checks these against the files; run the script again after replacing a banner.
export const HERO_BANNER_WIDTHS: Readonly<Record<string, number>> = {
  '/images/site-hero-banner.webp': 2400,
  '/images/Floating%20Plugin%20Interface%20Tiles.webp': 2804,
  '/images/new%20size/3d-model.webp': 2804,
  '/images/CUSTOM%20PROJECTS.webp': 4224,
  '/images/contact-hero.webp': 2400,
  '/images/new%20size/contact-page.webp': 2804,
  '/banner%20image/08.webp': 4096,
  '/images/new%20banner%20image%20size/Moody%20Luxury%20Skincare%20Collection.webp': 2804,
  '/images/new%20banner%20image%20size/Wooden%20Train%20and%20Rainbow%20Toys%20on%20NavyBackdrop.webp': 2804,
  '/images/new%20banner%20image%20size/Electronics.webp': 2804,
  '/images/new%20banner%20image%20size/Food%20&%20Drink.webp': 2804,
  '/images/new%20banner%20image%20size/Character.webp': 2804,
  '/images/new%20banner%20image%20size/Industrial.webp': 2804,
  '/images/new%20banner%20image%20size/3D%20Printing.webp': 2804,
  '/images/new%20banner%20image%20size/Assets%20%20Props.webp': 2804,
  '/images/new%20banner%20image%20size/AR%20Armchair%20Studio%20Showcase.webp': 2804,
  '/images/new%20banner%20image%20size/Architectural%203D%20Models.webp': 2804,
  '/images/new%20banner%20image%20size/Cinematic%20Floating%20Pavilion%20Interior.webp': 2804,
  '/images/new%20banner%20image%20size/Cloth%20Items.webp': 2804,
  '/images/new%20banner%20image%20size/Household.webp': 2804,
  '/images/new%20banner%20image%20size/Moody%20Minimalist%20Sofa%20Nook.webp': 2804,
  '/images/new%20banner%20image%20size/Moody%20Modern%20Lighting%20Vignette.webp': 2804,
  '/images/new%20banner%20image%20size/Moody%20Panoramic%20Indoor%20Plant%20Collection.webp': 2804,
}

/** `/a/b.webp` + 768 → `/a/b-768.webp` */
export function heroVariantPath(path: string, width: number): string {
  return path.replace(/\.webp$/, `-${width}.webp`)
}

/** srcset for a hero banner, or undefined for a picture without smaller copies. */
export function heroSrcSet(src: string): string | undefined {
  const [path, query = ''] = src.split(/(?=\?)/)
  const width = HERO_BANNER_WIDTHS[path]
  if (!width) return undefined
  const copies = HERO_VARIANT_WIDTHS.filter((w) => w < width).map((w) => `${heroVariantPath(path, w)}${query} ${w}w`)
  return [...copies, `${src} ${width}w`].join(', ')
}

const PAGE_BANNERS: Readonly<Record<string, string>> = {
  '/plugins': PLUGINS_HERO_IMAGE_SRC,
  '/about': ABOUT_HERO_IMAGE_SRC,
  '/contact': CONTACT_HERO_IMAGE_SRC,
  '/custom-projects': CUSTOM_PROJECTS_HERO_IMAGE_SRC,
  '/3d-models': MODELS_HERO_IMAGE_SRC,
}

/** The banner a page address shows at the top, or undefined for a page without one. */
export function heroBannerForPath(path: string): string | undefined {
  if (PAGE_BANNERS[path]) return PAGE_BANNERS[path]
  const category = /^\/3d-models\/([a-z0-9_-]+)$/i.exec(path)
  return category ? categoryBanner(category[1].toLowerCase()) : undefined
}

/** Link header value that preloads the page's banner exactly as its <img> will ask for it. */
export function heroPreloadLink(path: string): string | undefined {
  const src = heroBannerForPath(path)
  if (!src) return undefined
  const srcset = heroSrcSet(src)
  const responsive = srcset ? `; imagesrcset="${srcset}"; imagesizes="${HERO_IMAGE_SIZES}"` : ''
  return `<${src}>; rel=preload; as=image; fetchpriority=high${responsive}`
}
