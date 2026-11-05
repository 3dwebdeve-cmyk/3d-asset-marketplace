import { useCallback, useLayoutEffect, useRef, useState } from 'react'

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

/** Show the render on a neutral backdrop, with its stored side colours behind the empty sides. */
export function ProductImagePreview({ src, alt, sideColours, onError }: ProductImagePreviewProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  // True when the empty space is on the left and right; null until the image has loaded.
  const [hasSideGaps, setHasSideGaps] = useState<boolean | null>(null)

  const updateSideGaps = useCallback(() => {
    const image = imageRef.current
    if (!image || !image.naturalWidth || !image.naturalHeight) return
    const { width, height } = image.getBoundingClientRect()
    const next = height > 0 ? width / height >= image.naturalWidth / image.naturalHeight : true
    setHasSideGaps(next)
  }, [])

  useLayoutEffect(() => {
    setHasSideGaps(null)
    updateSideGaps()
    const image = imageRef.current
    if (!image || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateSideGaps)
    observer.observe(image)
    return () => observer.disconnect()
  }, [src, updateSideGaps])

  return (
    <div className="product-detail-stage__image-preview">
      {hasSideGaps && sideColours ? (
        <>
          <div
            className="product-detail-stage__image-edge product-detail-stage__image-edge--left"
            style={{ backgroundColor: sideColours.left }}
            aria-hidden="true"
          />
          <div
            className="product-detail-stage__image-edge product-detail-stage__image-edge--right"
            style={{ backgroundColor: sideColours.right }}
            aria-hidden="true"
          />
        </>
      ) : null}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className="product-detail-stage__image"
        onLoad={updateSideGaps}
        onError={onError}
      />
    </div>
  )
}
