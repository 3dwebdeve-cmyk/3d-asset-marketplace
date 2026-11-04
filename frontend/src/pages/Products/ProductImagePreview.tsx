import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface ProductImagePreviewProps {
  src: string
  alt: string
  onError: () => void
}

interface SideColors {
  left: string
  right: string
}

const SAMPLE_MAX_WIDTH = 256
// Share of the image width and height read from each side edge, starting at the top.
const SAMPLE_BAND_WIDTH = 0.04
const SAMPLE_BAND_HEIGHT = 0.2
// Keep the sampled colour a little less saturated than the photo's own edge.
const SIDE_MUTE = 0.6

function muteChannel(channel: number, luminance: number) {
  return Math.round(Math.min(255, Math.max(0, luminance + (channel - luminance) * SIDE_MUTE)))
}

function averageRgb(data: Uint8ClampedArray) {
  let r = 0
  let g = 0
  let b = 0
  const pixels = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
  }
  return { r: r / pixels, g: g / pixels, b: b / pixels }
}

function toMutedCss({ r, g, b }: { r: number; g: number; b: number }) {
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return `rgb(${muteChannel(r, luminance)}, ${muteChannel(g, luminance)}, ${muteChannel(b, luminance)})`
}

/** Sample the top of each side edge. Returns null when the browser refuses to read the pixels. */
function sampleTopSides(image: HTMLImageElement): SideColors | null {
  try {
    const scale = Math.min(1, SAMPLE_MAX_WIDTH / image.naturalWidth)
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(image, 0, 0, width, height)

    const bandWidth = Math.max(1, Math.round(width * SAMPLE_BAND_WIDTH))
    const bandHeight = Math.max(1, Math.round(height * SAMPLE_BAND_HEIGHT))
    const left = averageRgb(context.getImageData(0, 0, bandWidth, bandHeight).data)
    const right = averageRgb(context.getImageData(width - bandWidth, 0, bandWidth, bandHeight).data)
    return { left: toMutedCss(left), right: toMutedCss(right) }
  } catch {
    // Cross-origin images without CORS headers taint the canvas; the edge stretch still applies.
    return null
  }
}

/** Match the image's top side colours into letterboxing; never filter the foreground image. */
export function ProductImagePreview({ src, alt, onError }: ProductImagePreviewProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [edges, setEdges] = useState<{ width: number; height: number; sides: boolean } | null>(null)
  const [sideColors, setSideColors] = useState<SideColors | null>(null)

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

  // Sample from a separate image so a CORS failure never blocks the displayed render.
  useEffect(() => {
    setSideColors(null)
    if (typeof document === 'undefined') return
    const sampler = new Image()
    let active = true
    sampler.crossOrigin = 'anonymous'
    sampler.onload = () => {
      if (!active) return
      const colors = sampleTopSides(sampler)
      if (colors) setSideColors(colors)
    }
    sampler.src = src
    return () => {
      active = false
      sampler.onload = null
      sampler.src = ''
    }
  }, [src])

  const flatSides = edges?.sides ? sideColors : null
  const strips = edges && !flatSides ? (edges.sides
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
      {flatSides ? (
        <>
          <div
            className="product-detail-stage__image-edge product-detail-stage__image-edge--left"
            style={{ backgroundColor: flatSides.left }}
            aria-hidden="true"
          />
          <div
            className="product-detail-stage__image-edge product-detail-stage__image-edge--right"
            style={{ backgroundColor: flatSides.right }}
            aria-hidden="true"
          />
        </>
      ) : null}
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
