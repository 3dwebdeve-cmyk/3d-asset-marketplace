import '../styles/mobile-hero.css'
import { HERO_IMAGE_SIZES, SITE_HERO_IMAGE_SRC, heroSrcSet } from '../lib/heroBanners'

export {
  SITE_HERO_IMAGE_SRC,
  PLUGINS_HERO_IMAGE_SRC,
  MODELS_HERO_IMAGE_SRC,
  CUSTOM_PROJECTS_HERO_IMAGE_SRC,
  CONTACT_HERO_IMAGE_SRC,
  ABOUT_HERO_IMAGE_SRC,
} from '../lib/heroBanners'

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
      srcSet={heroSrcSet(src)}
      alt=""
      width={width}
      height={height}
      sizes={HERO_IMAGE_SIZES}
      decoding="async"
      fetchPriority="high"
    />
  )
}
