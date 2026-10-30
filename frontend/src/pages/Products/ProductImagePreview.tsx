import { useCallback, useLayoutEffect, useRef, useState } from 'react'

interface ProductImagePreviewProps {
  src: string
  alt: string
  onError: () => void
}

/** Extend only the image's edge colours into letterboxing; never filter the foreground image. */
export function ProductImagePreview({ src, alt, onError }: ProductImagePreviewProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [edges, setEdges] = useState<{ width: number; height: number; sides: boolean } | null>(null)

  const updateEdges = useCallback(() => {
    const image = imageRef.current
    const frame = frameRef.current
    if (!image || !frame || !image.naturalWidth || !image.naturalHeight) return
    const { width, height } = image.getBoundingClientRect()
    const next = {
      width: image.naturalWidth,
      height: image.naturalHeight,
      sides: height > 0 ? width / height >= image.naturalWidth / image.naturalHeight : true,
    }
    setEdges((current) => current?.width === next.width && current.height === next.height && current.sides === next.sides
      ? current : next)
  }, [])

  useLayoutEffect(() => {
    setEdges(null)
    updateEdges()
    const image = imageRef.current
    if (!image || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateEdges)
    observer.observe(image)
    return () => observer.disconnect()
  }, [src, updateEdges])

  const strips = edges ? (edges.sides
    ? [
      { edge: 'left', viewBox: `0 0 1 ${edges.height}` },
      { edge: 'right', viewBox: `${edges.width - 1} 0 1 ${edges.height}` },
    ]
    : [
      { edge: 'top', viewBox: `0 0 ${edges.width} 1` },
      { edge: 'bottom', viewBox: `0 ${edges.height - 1} ${edges.width} 1` },
    ]) : []

  return (
    <div ref={frameRef} className={`product-detail-stage__image-preview${edges ? ' product-detail-stage__image-preview--matched' : ''}`}>
      {strips.map(({ edge, viewBox }) => (
        <svg
          key={edge}
          className={`product-detail-stage__image-edge product-detail-stage__image-edge--${edge}`}
          viewBox={viewBox}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {/* SVG clipping works with remote images without reading canvas pixels or requiring CORS. */}
          <image href={src} width={edges!.width} height={edges!.height} preserveAspectRatio="none" />
        </svg>
      ))}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className="product-detail-stage__image"
        onLoad={updateEdges}
        onError={onError}
      />
    </div>
  )
}
