export const SITE_HERO_IMAGE_SRC = '/images/site-hero-banner.webp?v=9'
export const PLUGINS_HERO_IMAGE_SRC = '/images/plugins-hero.webp?v=5'
export const CUSTOM_PROJECTS_HERO_IMAGE_SRC = '/images/custom-projects-hero.webp?v=3'
export const CONTACT_HERO_IMAGE_SRC = '/images/contact-hero.webp?v=2'
export const ABOUT_HERO_IMAGE_SRC = '/images/about/about-hero.webp?v=7'

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
