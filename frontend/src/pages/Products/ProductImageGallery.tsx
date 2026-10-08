import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

import { LazyModelViewer } from '../../components/viewer/LazyModelViewer'
import { isSafePreviewModelUrl } from '../../components/viewer/isSafePreviewModelUrl'
import { isSafePreviewVideoUrl } from '../../components/viewer/isSafePreviewVideoUrl'
import type { ProductImage } from '../../types/product'

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
      alt: `${productName} image ${index + 1}`,
    }))

  if (fromApi.length > 0) {
    return fromApi
  }

  if (thumbnail.trim()) {
    return [{ id: 'thumbnail', src: thumbnail, alt: productName }]
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
        showPrevious()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        showNext()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [lightboxOpen, closeLightbox, showPrevious, showNext])

  return (
    <div className="product-detail-gallery">
      <div className="product-detail-stage" ref={stageRef}>
        {showModelStage ? (
          <div className="product-detail-stage__viewer">
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
            onClick={openLightbox}
            aria-label={`View larger image of ${productName}`}
            aria-controls={`${galleryId}-lightbox`}
            aria-expanded={lightboxOpen}
          >
            <img
              src={activeImage.src}
              alt={activeImage.alt}
              className="product-detail-stage__image"
              onError={() => markFailed(activeImage.id)}
            />
          </button>
        )}

        {showStageChrome && stageOverlays ? (
          <div className="product-detail-stage__overlays">{stageOverlays}</div>
        ) : null}
        {showModelStage ? (
          <button
            type="button"
            className="product-detail-stage__fullscreen"
            aria-label="View 3D model in fullscreen"
            title="Fullscreen"
            onClick={() => void stageRef.current?.requestFullscreen()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8.5 4H4v4.5M15.5 4H20v4.5M20 15.5V20h-4.5M8.5 20H4v-4.5" />
            </svg>
          </button>
        ) : null}
      </div>

      {galleryImages.length > 0 ||
      (showPreviewModeThumbs && (hasSafePreviewModel || hasSafePreviewVideo)) ? (
        <ul className="product-detail-gallery__thumbs" aria-label="Product image thumbnails">
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
                <span className="product-detail-gallery__thumb-3d">3D</span>
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
                <span className="product-detail-gallery__thumb-3d">Video</span>
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
                  onClick={showPrevious}
                  aria-label="Previous image"
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="product-detail-lightbox__nav product-detail-lightbox__nav--next"
                  onClick={showNext}
                  aria-label="Next image"
                >
                  Next
                </button>
              </>
            ) : null}
            <img
              src={activeImage.src}
              alt={activeImage.alt}
              className="product-detail-lightbox__image"
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
