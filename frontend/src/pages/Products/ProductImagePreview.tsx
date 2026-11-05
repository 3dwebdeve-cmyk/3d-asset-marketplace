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
 * Show the render on a backdrop made from its own stored edge colours, much lighter than the
 * edge so the render's boundary stands out. The colour arrives with the image data, so it is
 * painted in the first frame, before the image has downloaded. Without stored colours the
 * stylesheet's neutral backdrop shows.
 */
export function ProductImagePreview({ src, alt, sideColours, onError }: ProductImagePreviewProps) {
  const background = sideColours ? backdropColour(sideColours.left, sideColours.right) : null

  return (
    <div className="product-detail-stage__image-preview" style={background ? { background } : undefined}>
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
