export const SITE_HERO_IMAGE_SRC = '/images/site-hero-banner.jpg?v=6'
export const PLUGINS_HERO_IMAGE_SRC = '/images/plugins-hero.jpg?v=3'
export const ABOUT_HERO_IMAGE_SRC = '/images/about/about-hero.jpg?v=5'

type SiteHeroImageProps = {
  src?: string
}

export function SiteHeroImage({ src = SITE_HERO_IMAGE_SRC }: SiteHeroImageProps) {
  return (
    <img
      className="site-hero-banner__image"
      src={src}
      alt=""
      width={4096}
      height={984}
      decoding="async"
    />
  )
}
