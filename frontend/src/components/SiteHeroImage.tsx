export const SITE_HERO_IMAGE_SRC = '/images/site-hero-banner.webp?v=9'
export const PLUGINS_HERO_IMAGE_SRC = '/images/Floating%20Plugin%20Interface%20Tiles.png'
export const MODELS_HERO_IMAGE_SRC = '/images/new%20size/3d-model.png'
export const CUSTOM_PROJECTS_HERO_IMAGE_SRC = '/images/new%20size/custom-page2.png'
export const CONTACT_HERO_IMAGE_SRC = '/images/contact-hero.webp?v=2'
export const ABOUT_HERO_IMAGE_SRC = '/images/new%20size/contact-page.png'

type SiteHeroImageProps = {
  src?: string
  width?: number
  height?: number
}

export function SiteHeroImage({
  src = SITE_HERO_IMAGE_SRC,
  width = 1920,
  height = 480,
}: SiteHeroImageProps) {
  return (
    <img
      className="site-hero-banner__image"
      src={src}
      alt=""
      width={width}
      height={height}
      sizes="100vw"
      decoding="async"
      fetchPriority="high"
    />
  )
}
