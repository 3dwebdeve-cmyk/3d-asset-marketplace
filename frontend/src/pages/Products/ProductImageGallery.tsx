import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

import { LazyModelViewer } from '../../components/viewer/LazyModelViewer'
import { isSafePreviewModelUrl } from '../../components/viewer/isSafePreviewModelUrl'
import { isSafePreviewVideoUrl } from '../../components/viewer/isSafePreviewVideoUrl'
import type { ProductImage } from '../../types/product'
import { ProductImagePreview } from './ProductImagePreview'
import { ZoomableImage } from './ZoomableImage'

interface GalleryImage {
  id: string
  src: string
  alt: string
}

type StageViewMode = 'model' | 'image' | 'video'

interface ProductImageGalleryProps {
  productName: string
  thumbnail: string
  images: ProductImage[]
  previewModelUrl: string
  previewVideoUrl?: string
  showStageChrome?: boolean
  showPreviewModeThumbs?: boolean
  stageOverlays?: ReactNode
}

function buildGalleryImages(
  productName: string,
  thumbnail: string,
  images: ProductImage[],
): GalleryImage[] {
  const ordered = [...images].sort((a, b) => {
    if (a.is_primary !== b.is_primary) {
      return a.is_primary ? -1 : 1
    }
    return a.display_order - b.display_order
  })

  const fromApi = ordered
    .filter((image) => Boolean(image.image_url.trim()))
    .map((image, index) => ({
      id: image.id,
      src: image.image_url,
      alt: `${productName} 3D model, image ${index + 1}`,
    }))

  if (fromApi.length > 0) {
    return fromApi
  }

  if (thumbnail.trim()) {
    return [{ id: 'thumbnail', src: thumbnail, alt: `${productName} 3D model` }]
  }

  return []
}

export function ProductImageGallery({
  productName,
  thumbnail,
  images,
  previewModelUrl,
  previewVideoUrl = '',
  showStageChrome = false,
  showPreviewModeThumbs = false,
  stageOverlays,
}: ProductImageGalleryProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const thumbnailRailRef = useRef<HTMLElement>(null)
  const thumbnailsRef = useRef<HTMLUListElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const galleryId = useId()
  const hasSafePreviewModel = isSafePreviewModelUrl(previewModelUrl)
  const hasSafePreviewVideo = isSafePreviewVideoUrl(previewVideoUrl)

  // Warm the preview GLB in the HTTP cache without pulling Three.js into this chunk.
  useEffect(() => {
    const url = previewModelUrl.trim()
    if (!isSafePreviewModelUrl(url) || typeof fetch !== 'function') {
      return
    }
    const controller = new AbortController()
    void fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal,
    }).catch(() => {
      // Preload is best-effort; the viewer will surface real load errors.
    })
    return () => controller.abort()
  }, [previewModelUrl])

  const galleryImages = useMemo(
    () => buildGalleryImages(productName, thumbnail, images),
    [productName, thumbnail, images],
  )

  const [viewMode, setViewMode] = useState<StageViewMode>(() => {
    if (hasSafePreviewModel) return 'model'
    if (hasSafePreviewVideo) return 'video'
    return 'image'
  })
  const [activeIndex, setActiveIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [imgErrorIds, setImgErrorIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (hasSafePreviewModel) {
      setViewMode('model')
    } else if (hasSafePreviewVideo) {
      setViewMode('video')
    } else {
      setViewMode('image')
    }
  }, [hasSafePreviewModel, hasSafePreviewVideo, previewModelUrl, previewVideoUrl])

  const safeIndex = galleryImages.length === 0 ? 0 : Math.min(activeIndex, galleryImages.length - 1)
  const activeImage = galleryImages[safeIndex] ?? null
  const activeFailed = activeImage ? imgErrorIds.has(activeImage.id) : true
  const showModelStage = hasSafePreviewModel && viewMode === 'model'
  const showVideoStage = hasSafePreviewVideo && viewMode === 'video'
  const showImageStage = !showModelStage && !showVideoStage

  const markFailed = useCallback((id: string) => {
    setImgErrorIds((current) => {
      if (current.has(id)) {
        return current
      }
      const next = new Set(current)
      next.add(id)
      return next
    })
  }, [])

  const openLightbox = useCallback(() => {
    if (!activeImage || activeFailed) {
      return
    }
    setLightboxOpen(true)
  }, [activeImage, activeFailed])

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false)
  }, [])

  const totalCount =
    (hasSafePreviewModel ? 1 : 0) + (hasSafePreviewVideo ? 1 : 0) + galleryImages.length || 1

  const showPrevious = useCallback(() => {
    if (totalCount <= 1) {
      return
    }
    if (showModelStage) {
      if (galleryImages.length > 0) {
        setActiveIndex(galleryImages.length - 1)
        setViewMode('image')
      } else if (hasSafePreviewVideo) {
        setViewMode('video')
      }
    } else if (showVideoStage) {
      if (hasSafePreviewModel) {
        setViewMode('model')
      } else if (galleryImages.length > 0) {
        setActiveIndex(galleryImages.length - 1)
        setViewMode('image')
      }
    } else {
      if (safeIndex > 0) {
        setActiveIndex(safeIndex - 1)
        setViewMode('image')
      } else if (hasSafePreviewVideo) {
        setViewMode('video')
      } else if (hasSafePreviewModel) {
        setViewMode('model')
      } else {
        setActiveIndex(galleryImages.length - 1)
        setViewMode('image')
      }
    }
  }, [
    totalCount,
    showModelStage,
    showVideoStage,
    safeIndex,
    galleryImages.length,
    hasSafePreviewModel,
    hasSafePreviewVideo,
  ])

  const showNext = useCallback(() => {
    if (totalCount <= 1) {
      return
    }
    if (showModelStage) {
      if (hasSafePreviewVideo) {
        setViewMode('video')
      } else if (galleryImages.length > 0) {
        setActiveIndex(0)
        setViewMode('image')
      }
    } else if (showVideoStage) {
      if (galleryImages.length > 0) {
        setActiveIndex(0)
        setViewMode('image')
      } else if (hasSafePreviewModel) {
        setViewMode('model')
      }
    } else {
      if (safeIndex < galleryImages.length - 1) {
        setActiveIndex(safeIndex + 1)
        setViewMode('image')
      } else if (hasSafePreviewModel) {
        setViewMode('model')
      } else if (hasSafePreviewVideo) {
        setViewMode('video')
      } else {
        setActiveIndex(0)
        setViewMode('image')
      }
    }
  }, [
    totalCount,
    showModelStage,
    showVideoStage,
    safeIndex,
    galleryImages.length,
    hasSafePreviewModel,
    hasSafePreviewVideo,
  ])

  const selectImage = useCallback((index: number) => {
    setActiveIndex(index)
    setViewMode('image')
  }, [])

  // The fullscreen image view stays within images; stage navigation includes all media.
  const stepLightbox = useCallback((direction: number) => {
    if (galleryImages.length > 0) {
      selectImage((safeIndex + direction + galleryImages.length) % galleryImages.length)
    }
  }, [galleryImages.length, safeIndex, selectImage])

  const stagePosition = showModelStage ? 1 : showVideoStage
    ? (hasSafePreviewModel ? 2 : 1)
    : (hasSafePreviewModel ? 1 : 0) + (hasSafePreviewVideo ? 1 : 0) + safeIndex + 1

  const hasThumbnails = galleryImages.length > 0 ||
    (showPreviewModeThumbs && (hasSafePreviewModel || hasSafePreviewVideo))

  useEffect(() => {
    const rail = thumbnailRailRef.current
    const strip = thumbnailsRef.current
    if (!rail || !strip) return

    let frame: number | null = null
    let target = strip.scrollLeft
    let start = target
    let startedAt = 0
    let direction = 0
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      target = strip.scrollLeft
    }
    const animate = (now: number) => {
      target = Math.min(target, Math.max(0, strip.scrollWidth - strip.clientWidth))
      const progress = Math.min(1, (now - startedAt) / 380)
      // Ease out like a gently settling carousel, without overshooting an edge.
      strip.scrollLeft = start + (target - start) * (1 - Math.pow(1 - progress, 3))
      frame = progress < 1 ? requestAnimationFrame(animate) : null
    }

    const onWheel = (event: WheelEvent) => {
      // Leave browser zoom and native horizontal trackpad gestures alone.
      if (event.ctrlKey || event.metaKey) return
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
        stop()
        return
      }
      const maxScroll = strip.scrollWidth - strip.clientWidth
      if (maxScroll <= 0 || !event.cancelable) return

      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1)
      if ((delta < 0 && strip.scrollLeft <= 0) || (delta > 0 && strip.scrollLeft >= maxScroll - 1)) return

      event.preventDefault()
      if (frame === null || Math.sign(delta) !== direction) target = strip.scrollLeft
      target = Math.max(0, Math.min(maxScroll, target + delta))
      direction = Math.sign(delta)
      if (frame !== null) cancelAnimationFrame(frame)
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        strip.scrollLeft = target
        frame = null
        return
      }
      start = strip.scrollLeft
      startedAt = performance.now()
      frame = requestAnimationFrame(animate)
    }

    // A non-passive listener is required to prevent vertical page scrolling.
    rail.addEventListener('wheel', onWheel, { passive: false })
    rail.addEventListener('pointerdown', stop)
    rail.addEventListener('touchstart', stop, { passive: true })
    return () => {
      stop()
      rail.removeEventListener('wheel', onWheel)
      rail.removeEventListener('pointerdown', stop)
      rail.removeEventListener('touchstart', stop)
    }
  }, [hasThumbnails, stagePosition])

  // Move only the thumbnail strip, never the page, when the selected preview changes.
  const revealSelectedThumbnail = useCallback(() => {
    const strip = thumbnailsRef.current
    const selected = strip?.querySelector<HTMLButtonElement>('[aria-current="true"]')
    if (!strip || !selected) return
    const stripBounds = strip.getBoundingClientRect()
    const selectedBounds = selected.getBoundingClientRect()
    const inset = 4 // Keep the active outline inside the scroll viewport.
    let offset = 0
    if (selectedBounds.left < stripBounds.left + inset) {
      offset = selectedBounds.left - stripBounds.left - inset
    } else if (selectedBounds.right > stripBounds.right - inset) {
      offset = selectedBounds.right - stripBounds.right + inset
    }
    if (offset) {
      strip.scrollTo?.({
        left: strip.scrollLeft + offset,
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
    }
  }, [])

  useEffect(() => {
    revealSelectedThumbnail()
  }, [stagePosition, galleryImages, imgErrorIds, showPreviewModeThumbs, revealSelectedThumbnail])

  useEffect(() => {
    const strip = thumbnailsRef.current
    if (!strip || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(revealSelectedThumbnail)
    observer.observe(strip)
    return () => observer.disconnect()
  }, [hasThumbnails, revealSelectedThumbnail])

  useEffect(() => {
    if (!lightboxOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeLightbox()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        stepLightbox(-1)
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        stepLightbox(1)
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [lightboxOpen, closeLightbox, stepLightbox])

  return (
    <div className="product-detail-gallery">
      <div
        className="product-detail-stage"
        ref={stageRef}
        role="region"
        aria-label={`${productName} media gallery`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (lightboxOpen || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
          // Arrow keys inside the model and video belong to their own controls.
          if ((event.target as HTMLElement).closest('.product-detail-stage__viewer, video, input, textarea, select, [contenteditable="true"]')) return
          if (totalCount <= 1 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
          event.preventDefault()
          event.stopPropagation()
          if (event.key === 'ArrowLeft') showPrevious()
          else showNext()
        }}
      >
        {showModelStage ? (
          <div className="product-detail-stage__viewer" ref={viewerRef}>
            <LazyModelViewer
              modelUrl={previewModelUrl.trim()}
              ariaLabel={`Interactive 3D preview of ${productName}`}
            />
          </div>
        ) : showVideoStage ? (
          <div className="product-detail-stage__video-wrap">
            <video
              className="product-detail-stage__video"
              src={previewVideoUrl.trim()}
              controls
              playsInline
              preload="metadata"
              aria-label={`Preview video of ${productName}`}
            >
              Your browser does not support this preview video.
            </video>
          </div>
        ) : !activeImage || activeFailed ? (
          <div
            className="product-detail-stage__empty"
            role="img"
            aria-label={`${productName} has no preview image`}
          >
            <p className="product-detail-stage__empty-title">No preview image</p>
            <p className="product-detail-stage__empty-body">
              {hasSafePreviewModel
                ? 'Interactive preview model is loading when available.'
                : hasSafePreviewVideo
                  ? 'Preview video is available when provided.'
                  : 'No preview image or model is available for this product yet.'}
            </p>
          </div>
        ) : (
          <button
            type="button"
            className="product-detail-stage__main"
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse') swiped.current = false
            }}
            onClick={() => {
              if (swiped.current) { swiped.current = false; return }
              openLightbox()
            }}
            onTouchStart={(event) => {
              swiped.current = false
              const touch = event.touches.length === 1 ? event.touches[0] : null
              touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
            }}
            onTouchMove={(event) => {
              if (event.touches.length !== 1) touchStart.current = null
            }}
            onTouchCancel={() => { touchStart.current = null }}
            onTouchEnd={(event) => {
              const start = touchStart.current
              touchStart.current = null
              const touch = event.changedTouches[0]
              if (!start || !touch || event.touches.length > 0 || totalCount <= 1) return
              const dx = touch.clientX - start.x
              const dy = touch.clientY - start.y
              if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy) * 1.5) return
              swiped.current = true
              if (dx < 0) showNext()
              else showPrevious()
            }}
            aria-label={`View larger image of ${productName}`}
            aria-controls={`${galleryId}-lightbox`}
            aria-expanded={lightboxOpen}
          >
            <ProductImagePreview
              key={activeImage.src}
              src={activeImage.src}
              alt={activeImage.alt}
              onError={() => markFailed(activeImage.id)}
            />
          </button>
        )}

        {totalCount > 1 ? (
          <>
            <button
              type="button"
              className="product-detail-stage__nav product-detail-stage__nav--prev"
              aria-label="Previous preview"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); showPrevious() }}
            ><span aria-hidden="true">‹</span></button>
            <button
              type="button"
              className="product-detail-stage__nav product-detail-stage__nav--next"
              aria-label="Next preview"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); showNext() }}
            ><span aria-hidden="true">›</span></button>
            <span className="product-detail-stage__counter" role="status" aria-live="polite" aria-atomic="true">
              <span className="product-detail-stage__counter-label">Preview </span>{stagePosition} / {totalCount}
            </span>
          </>
        ) : null}
        {showStageChrome && stageOverlays ? (
          <div className="product-detail-stage__overlays">{stageOverlays}</div>
        ) : null}
        {showModelStage ? (
          <button
            type="button"
            className="product-detail-stage__fullscreen"
            aria-label="View 3D model in fullscreen"
            title="Fullscreen"
            onClick={() => void viewerRef.current?.requestFullscreen()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8.5 4H4v4.5M15.5 4H20v4.5M20 15.5V20h-4.5M8.5 20H4v-4.5" />
            </svg>
          </button>
        ) : null}
      </div>

      {hasThumbnails ? (
        <section ref={thumbnailRailRef} className="product-detail-gallery__rail" aria-label="Gallery thumbnails">
          <div className="product-detail-gallery__rail-header">
            <h3 className="product-detail-gallery__rail-title">Gallery</h3>
            <span className="product-detail-gallery__rail-counter" aria-hidden="true">
              {stagePosition} / {totalCount}
            </span>
          </div>
          <div className="product-detail-gallery__rail-controls">
            <button
              type="button"
              className="product-detail-gallery__rail-nav"
              aria-label="Previous gallery item"
              aria-controls={`${galleryId}-thumbnails`}
              disabled={totalCount <= 1}
              onClick={showPrevious}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
            </button>
        <ul
          ref={thumbnailsRef}
          id={`${galleryId}-thumbnails`}
          className="product-detail-gallery__thumbs"
          aria-label="Product image thumbnails"
        >
          {showPreviewModeThumbs && hasSafePreviewModel ? (
            <li>
              <button
                type="button"
                className={`product-detail-gallery__thumb${
                  showModelStage ? ' product-detail-gallery__thumb--active' : ''
                }`}
                onClick={() => setViewMode('model')}
                aria-label="Show 3D preview"
                aria-current={showModelStage ? 'true' : undefined}
              >
                <span className="product-detail-gallery__thumb-3d">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5M12 12 3 7m9 5v10" />
                  </svg>
                  <span>3D</span>
                </span>
              </button>
            </li>
          ) : null}
          {showPreviewModeThumbs && hasSafePreviewVideo ? (
            <li>
              <button
                type="button"
                className={`product-detail-gallery__thumb${
                  showVideoStage ? ' product-detail-gallery__thumb--active' : ''
                }`}
                onClick={() => setViewMode('video')}
                aria-label="Show preview video"
                aria-current={showVideoStage ? 'true' : undefined}
              >
                <span className="product-detail-gallery__thumb-3d">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>
                  <span>Video</span>
                </span>
              </button>
            </li>
          ) : null}
          {galleryImages.map((image, index) => {
            const failed = imgErrorIds.has(image.id)
            if (failed) return null

            return (
              <li key={image.id}>
                <button
                  type="button"
                  className={`product-detail-gallery__thumb${
                    showImageStage && index === safeIndex
                      ? ' product-detail-gallery__thumb--active'
                      : ''
                  }`}
                  onClick={() => selectImage(index)}
                  aria-label={`Show image ${index + 1} of ${galleryImages.length}`}
                  aria-current={showImageStage && index === safeIndex ? 'true' : undefined}
                >
                  <img
                    src={image.src}
                    alt=""
                    className="product-detail-gallery__thumb-image"
                    onError={() => markFailed(image.id)}
                  />
                </button>
              </li>
            )
          })}
        </ul>
            <button
              type="button"
              className="product-detail-gallery__rail-nav"
              aria-label="Next gallery item"
              aria-controls={`${galleryId}-thumbnails`}
              disabled={totalCount <= 1}
              onClick={showNext}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
            </button>
          </div>
        </section>
      ) : null}

      {lightboxOpen && activeImage && !activeFailed ? (
        <div
          id={`${galleryId}-lightbox`}
          className="product-detail-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} image viewer`}
        >
          <button
            type="button"
            className="product-detail-lightbox__backdrop"
            aria-label="Close image viewer"
            onClick={closeLightbox}
          />
          <div className="product-detail-lightbox__content">
            <button
              type="button"
              className="product-detail-lightbox__close"
              onClick={closeLightbox}
              aria-label="Close image viewer"
            >
              Close
            </button>
            {galleryImages.length > 1 ? (
              <>
                <button
                  type="button"
                  className="product-detail-lightbox__nav product-detail-lightbox__nav--prev"
                  onClick={() => stepLightbox(-1)}
                  aria-label="Previous image"
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="product-detail-lightbox__nav product-detail-lightbox__nav--next"
                  onClick={() => stepLightbox(1)}
                  aria-label="Next image"
                >
                  Next
                </button>
              </>
            ) : null}
            <ZoomableImage
              key={activeImage.src}
              src={activeImage.src}
              alt={activeImage.alt}
            />
            <p className="product-detail-lightbox__counter">
              {safeIndex + 1} / {galleryImages.length}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
