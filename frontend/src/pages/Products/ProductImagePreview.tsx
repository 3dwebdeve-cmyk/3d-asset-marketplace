export interface SideColours {
  left: string
  right: string
}

interface ProductImagePreviewProps {
  src: string
  alt: string
  /** Colours sampled when the image was stored; absent for images stored before sampling. */
  sideColours?: SideColours | null
  /** Width divided by height of the stored render; absent for images stored before sampling. */
  aspectRatio?: number | null
  onError: () => void
}

/**
 * Show the render on a neutral backdrop. When its size is known, the empty sides beside it
 * start in the stored side colour and fade into the backdrop, all in the first paint.
 */
export function ProductImagePreview({ src, alt, sideColours, aspectRatio, onError }: ProductImagePreviewProps) {
  const sides = sideColours && aspectRatio ? { colours: sideColours, aspectRatio } : null

  return (
    <div
      className={
        sides
          ? 'product-detail-stage__image-preview product-detail-stage__image-preview--sided'
          : 'product-detail-stage__image-preview'
      }
    >
      {sides ? (
        <div
          className="product-detail-stage__image-edge"
          style={{ background: `linear-gradient(to left, ${sides.colours.left}, transparent)` }}
          aria-hidden="true"
        />
      ) : null}
      <img
        src={src}
        alt={alt}
        decoding="async"
        fetchPriority="high"
        className="product-detail-stage__image"
        style={sides ? { aspectRatio: sides.aspectRatio } : undefined}
        onError={onError}
      />
      {sides ? (
        <div
          className="product-detail-stage__image-edge"
          style={{ background: `linear-gradient(to right, ${sides.colours.right}, transparent)` }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  )
}
