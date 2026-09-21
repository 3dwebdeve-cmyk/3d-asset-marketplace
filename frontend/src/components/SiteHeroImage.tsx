export const SITE_HERO_IMAGE_SRC = '/images/site-hero-banner.jpg?v=8'
export const PLUGINS_HERO_IMAGE_SRC = '/images/plugins-hero.jpg?v=4'
export const CUSTOM_PROJECTS_HERO_IMAGE_SRC = '/images/custom-projects-hero.jpg?v=2'
export const CONTACT_HERO_IMAGE_SRC = '/images/contact-hero.jpg?v=1'
export const ABOUT_HERO_IMAGE_SRC = '/images/about/about-hero.jpg?v=6'

type SiteHeroImageProps = {
  src?: string
  width?: number
  height?: number
}

export function SiteHeroImage({
  src = SITE_HERO_IMAGE_SRC,
  width = 4224,
  height = 992,
}: SiteHeroImageProps) {
  return (
    <img
      className="site-hero-banner__image"
      src={src}
      alt=""
      width={width}
      height={height}
      decoding="async"
    />
  )
}
