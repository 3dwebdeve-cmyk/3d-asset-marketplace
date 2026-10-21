export const LOCAL_CATEGORY_IMAGES: Record<string, string> = {
  furniture: '/catego%20image/Luxurious%20Chaise%20Lounge%20Overlooking%20City%20Lights.webp',
  products: '/catego%20image/Premium%20Olive%20Gear%20Still%20Life.webp',
  toys: '/catego%20image/Colorful%20Toy%20Tabletop%20with%20Teddy%20Bear.webp',
  electronics: '/catego%20image/Premium%20Tech%20Gear%20Flat%20Lay.webp',
  'food-drink': '/catego%20image/Cinematic%20Red%20Tray%20Burger%20Feast.webp',
  character: '/catego%20image/Spiked%20Ogre%20Warrior%20with%20Stone%20Mace.webp',
  industrial: '/catego%20image/Industrial%20Yellow%20Engine%20Assembly.webp',
  household: '/homepage%20images/aaa/household.webp',
  'plants-vegetation': '/catego%20image/Sunlit%20Botanical%20Still%20Life%20with%20Ceramic%20Planters.webp',
  lights: '/catego%20image/Rustic%20Rope-Wrapped%20Pendant%20Chandelier.webp',
  '3d-printing': '/catego%20image/Vibrant%203D%20Printing%20Workshop%20Bench.webp',
  'assets-props': '/catego%20image/Sunlit%20Antique%20Trunk%20in%20a%20Cozy%20Study.webp',
  'lifestyle-visualisation': '/catego%20image/Warm%20Modern%20Living%20Room%20and%20Kitchen.webp',
  'cloth-items': '/catego%20image/Autumn%20Heritage%20Menswear%20Flat%20Lay.webp',
  'interactive-webar': '/catego%20image/Augmented%20Reality%20Living%20Room%20Design.webp',
  'architectural-3d-models': '/catego%20image/Illuminated%20Architectural%20House%20Model.webp',
  'interior-3d-models': '/catego%20image/Golden%20Moon%20Clock%20Living%20Room.webp',
}

/** Widths of the resized copies next to each local category image (name-640.webp, name-1000.webp). */
export const CATEGORY_IMAGE_WIDTHS = [640, 1000] as const
/**
 * What the card needs, by screen: one column on small phones, two on phones, four on larger
 * screens, so the browser can pick the smallest copy that is still sharp.
 */
const CATEGORY_IMAGE_SIZES = '(max-width: 420px) 92vw, (max-width: 800px) 46vw, 23vw'

export function resizedCategoryImage(path: string, width: number): string {
  return path.replace(/\.webp(\?.*)?$/, `-${width}.webp`)
}

/** Local images come in two sizes; an image that comes from the API is used as it is. */
export function responsiveImageProps(source: string, isLocal: boolean) {
  if (!isLocal) return { src: source }
  const largest = CATEGORY_IMAGE_WIDTHS[CATEGORY_IMAGE_WIDTHS.length - 1]
  return {
    src: resizedCategoryImage(source, largest),
    srcSet: CATEGORY_IMAGE_WIDTHS.map((w) => `${resizedCategoryImage(source, w)} ${w}w`).join(', '),
    sizes: CATEGORY_IMAGE_SIZES,
  }
}
