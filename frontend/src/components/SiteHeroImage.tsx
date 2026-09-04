export const SITE_HERO_IMAGE_SRC = '/images/site-hero-banner.jpg?v=6'

export function SiteHeroImage() {
  return (
    <img
      className="site-hero-banner__image"
      src={SITE_HERO_IMAGE_SRC}
      alt=""
      width={4096}
      height={984}
      decoding="async"
    />
  )
}
