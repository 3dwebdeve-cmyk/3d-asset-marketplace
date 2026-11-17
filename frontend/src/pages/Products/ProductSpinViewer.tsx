import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { SPIN_FRAME_COUNT, hasSpin } from '../../lib/spin'
import '../../styles/product-spin.css'

/** Pixels of horizontal drag per frame. */
const PIXELS_PER_FRAME = 12
/** One frame of the continuous turn (36 frames, about 4.3 seconds per full turn). */
const AUTO_ROTATE_FRAME_MS = 120
/** After a drag, an arrow key or ◀ ▶, the turn starts again this long after the last touch. */
const RESUME_AFTER_MS = 3000
/**
 * +1: dragging right, the right arrow key and the ▶ button show the next frame.
 * Set to -1 if the 3ds Max turntable turns the other way.
 */
const TURN_DIRECTION = 1

function wrapFrame(frame: number): number {
  return ((frame % SPIN_FRAME_COUNT) + SPIN_FRAME_COUNT) % SPIN_FRAME_COUNT
}

function prefersReducedMotion(): boolean {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

interface ProductSpinViewerProps {
  images: string[]
  productName: string
  /**
   * Turn continuously once every frame has loaded, with a Pause / Play button. With
   * reduced motion it starts paused. False keeps the viewer still (the admin console).
   */
  autoRotate?: boolean
  /** A smaller viewer, for the admin console. */
  compact?: boolean
}

/**
 * A 360° turntable: 36 photos of the model, one every 10°. Dragging, the arrow keys and
 * the ◀ ▶ buttons step through them, and they loop. Frame 1 shows at once; the other
 * frames load when the viewer opens, so the product page itself stays light. Once they
 * have, it turns continuously; the visitor's own turning holds it for a few seconds.
 */
export function ProductSpinViewer({
  images,
  productName,
  autoRotate = true,
  compact = false,
}: ProductSpinViewerProps) {
  const hintId = useId()
  const [frame, setFrame] = useState(0)
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set())
  const [aspectRatio, setAspectRatio] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  // Pause / Play: only the button changes it. Reduced motion starts paused.
  const [paused, setPaused] = useState(() => prefersReducedMotion())
  // False from the visitor's last drag, arrow key or ◀ ▶ until RESUME_AFTER_MS later.
  const [idle, setIdle] = useState(true)
  const resumeTimer = useRef<number | null>(null)
  const drag = useRef<{ pointerId: number; startX: number; startFrame: number } | null>(null)

  const ready = loaded.size >= SPIN_FRAME_COUNT
  const rotating = autoRotate && ready && !paused && idle && !dragging

  const clearResumeTimer = useCallback(() => {
    if (resumeTimer.current !== null) {
      window.clearTimeout(resumeTimer.current)
      resumeTimer.current = null
    }
  }, [])

  // The visitor has taken control: hold the turn, and restart the wait for it to resume.
  const holdAutoRotate = useCallback(() => {
    clearResumeTimer()
    setIdle(false)
    resumeTimer.current = window.setTimeout(() => {
      resumeTimer.current = null
      setIdle(true)
    }, RESUME_AFTER_MS)
  }, [clearResumeTimer])

  useEffect(() => clearResumeTimer, [clearResumeTimer])

  const togglePaused = () => {
    if (paused) {
      // Play turns at once, without waiting out an earlier hold.
      clearResumeTimer()
      setIdle(true)
    }
    setPaused(!paused)
  }

  const turn = useCallback((steps: number) => {
    holdAutoRotate()
    setFrame((current) => wrapFrame(current + TURN_DIRECTION * steps))
  }, [holdAutoRotate])

  const markLoaded = useCallback((index: number) => {
    setLoaded((current) => {
      if (current.has(index)) return current
      const next = new Set(current)
      next.add(index)
      return next
    })
  }, [])

  useEffect(() => {
    if (!rotating) return
    const timer = window.setInterval(() => {
      setFrame((current) => wrapFrame(current + 1))
    }, AUTO_ROTATE_FRAME_MS)
    return () => window.clearInterval(timer)
  }, [rotating])

  if (!hasSpin(images)) {
    return null
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    setDragging(false)
    holdAutoRotate() // The wait to resume counts from letting go.
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    // The gallery around the viewer uses the same keys for its own items.
    event.stopPropagation()
    turn(event.key === 'ArrowRight' ? 1 : -1)
  }

  return (
    <div className={`product-spin${compact ? ' product-spin--compact' : ''}`}>
      <div
        className={`product-spin__surface${dragging ? ' product-spin__surface--dragging' : ''}`}
        role="img"
        aria-label={`360° view of ${productName}`}
        aria-describedby={hintId}
        tabIndex={0}
        style={aspectRatio ? { aspectRatio } : undefined}
        data-frame={frame + 1}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return
          holdAutoRotate()
          drag.current = { pointerId: event.pointerId, startX: event.clientX, startFrame: frame }
          event.currentTarget.setPointerCapture?.(event.pointerId)
          setDragging(true)
        }}
        onPointerMove={(event) => {
          const current = drag.current
          if (!current || current.pointerId !== event.pointerId) return
          const steps = Math.trunc((event.clientX - current.startX) / PIXELS_PER_FRAME)
          setFrame(wrapFrame(current.startFrame + TURN_DIRECTION * steps))
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <img
          className="product-spin__frame"
          src={images[frame]}
          alt=""
          draggable={false}
          // No async decoding: the frame swaps constantly, and an async decode can flash blank.
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget
            if (!aspectRatio && frame === 0 && naturalWidth > 0 && naturalHeight > 0) {
              setAspectRatio(`${naturalWidth} / ${naturalHeight}`)
            }
          }}
        />
      </div>
      {!ready ? (
        <div
          className="product-spin__progress"
          role="progressbar"
          aria-label="Loading 360° view"
          aria-valuemin={0}
          aria-valuemax={SPIN_FRAME_COUNT}
          aria-valuenow={loaded.size}
        >
          <div
            className="product-spin__progress-bar"
            style={{ width: `${(loaded.size / SPIN_FRAME_COUNT) * 100}%` }}
          />
        </div>
      ) : null}

      <div className="product-spin__controls">
        <button type="button" className="product-spin__button" aria-label="Rotate left" onClick={() => turn(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m14 6-6 6 6 6" />
          </svg>
        </button>
        {autoRotate ? (
          <button
            type="button"
            className="product-spin__button"
            aria-label={paused ? 'Play rotation' : 'Pause rotation'}
            onClick={togglePaused}
          >
            {paused ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
              </svg>
            )}
          </button>
        ) : null}
        <span id={hintId} className="product-spin__hint">
          Drag to rotate<span className="product-spin__sr-only">, or use the arrow keys</span>
        </span>
        <button type="button" className="product-spin__button" aria-label="Rotate right" onClick={() => turn(1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m10 6 6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* Loads every frame when the viewer opens, so turning never waits for the network. */}
      <div hidden data-testid="spin-preload">
        {images.map((src, index) => (
          <img
            key={src}
            src={src}
            alt=""
            onLoad={() => markLoaded(index)}
            onError={() => markLoaded(index)}
          />
        ))}
      </div>
    </div>
  )
}
