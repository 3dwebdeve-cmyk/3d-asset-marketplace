import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

interface ProductImagePreviewProps {
  src: string
  alt: string
  onError: () => void
}

/** Keep the complete render sharp over a blurred, edge-blended backdrop. */
export function ProductImagePreview({ src, alt, onError }: ProductImagePreviewProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [fit, setFit] = useState<{ src: string; width: number; height: number } | null>(null)

  const updateFit = useCallback(() => {
    const image = imageRef.current
    if (!image?.naturalWidth || !image.naturalHeight) return
    const { width, height } = image.getBoundingClientRect()
    if (!width || !height) return
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
    const next = { src, width: image.naturalWidth * scale, height: image.naturalHeight * scale }
    setFit((current) => current?.src === next.src && current.width === next.width && current.height === next.height
      ? current : next)
  }, [src])

  useLayoutEffect(() => {
    setFit(null)
    updateFit()
    const image = imageRef.current
    if (!image || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateFit)
    observer.observe(image)
    return () => observer.disconnect()
  }, [src, updateFit])

  const fitted = fit?.src === src ? fit : null
  const style = fitted ? {
    '--preview-image-width': `${fitted.width}px`,
    '--preview-image-height': `${fitted.height}px`,
  } as CSSProperties : undefined

  return (
    <div className={`product-detail-stage__image-preview${fitted ? ' product-detail-stage__image-preview--matched' : ''}`}>
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="product-detail-stage__image-backdrop"
      />
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className="product-detail-stage__image"
        style={style}
        onLoad={updateFit}
        onError={onError}
      />
    </div>
  )
}
