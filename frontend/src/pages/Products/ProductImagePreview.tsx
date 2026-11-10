import { backdropColour } from './backdropColour'

export interface SideColours {
  left: string
  right: string
}

interface ProductImagePreviewProps {
  src: string
  alt: string
  /** Colours sampled when the image was stored; absent for images stored before sampling. */
  sideColours?: SideColours | null
  onError: () => void
}

/**
 * Extend a blurred sample of each top corner into its corresponding side. Stored colours
 * provide an immediate background while the image loads; older images use a neutral fallback.
 */
export function ProductImagePreview({ src, alt, sideColours, onError }: ProductImagePreviewProps) {
  const imageBackground = `url(${JSON.stringify(src)})`

  return (
    <div className="product-detail-stage__image-preview">
      <div className="product-detail-stage__corner product-detail-stage__corner--left" aria-hidden="true"
        style={{ backgroundColor: backdropColour(sideColours?.left), backgroundImage: imageBackground }} />
      <div className="product-detail-stage__corner product-detail-stage__corner--right" aria-hidden="true"
        style={{ backgroundColor: backdropColour(sideColours?.right), backgroundImage: imageBackground }} />
      <img
        src={src}
        alt={alt}
        decoding="async"
        fetchPriority="high"
        className="product-detail-stage__image"
        onError={onError}
      />
    </div>
  )
}
