import { useEffect, useRef, useState } from 'react'

type Point = { x: number; y: number }
type View = Point & { scale: number }
const initialView: View = { x: 0, y: 0, scale: 1 }

export function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const viewRef = useRef(initialView)
  const [view, setView] = useState(initialView)
  const pointers = useRef(new Map<number, Point>())
  const tap = useRef<{ time: number; point: Point } | null>(null)
  const press = useRef<Point | null>(null)

  function update(next: View) {
    const image = imageRef.current
    const scale = Math.max(1, Math.min(5, next.scale))
    const limitX = (image?.clientWidth ?? 0) * (scale - 1) / 2
    const limitY = (image?.clientHeight ?? 0) * (scale - 1) / 2
    const bounded = {
      scale,
      x: Math.max(-limitX, Math.min(limitX, next.x)),
      y: Math.max(-limitY, Math.min(limitY, next.y)),
    }
    viewRef.current = bounded
    setView(bounded)
  }

  function zoom(scale: number, point: Point) {
    const rect = viewportRef.current!.getBoundingClientRect()
    const current = viewRef.current
    const ratio = Math.max(1, Math.min(5, scale)) / current.scale
    const x = point.x - rect.left - rect.width / 2
    const y = point.y - rect.top - rect.height / 2
    update({ scale, x: x - (x - current.x) * ratio, y: y - (y - current.y) * ratio })
  }

  function toggle(point: Point) {
    if (viewRef.current.scale > 1) update(initialView)
    else zoom(2.5, point)
  }

  useEffect(() => {
    const viewport = viewportRef.current!
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1)
      zoom(viewRef.current.scale * Math.exp(-delta * 0.002), { x: event.clientX, y: event.clientY })
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div
      ref={viewportRef}
      className="product-detail-lightbox__zoom"
      style={{ cursor: view.scale > 1 ? 'grab' : 'zoom-in' }}
      onDoubleClick={(event) => toggle({ x: event.clientX, y: event.clientY })}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        const point = { x: event.clientX, y: event.clientY }
        pointers.current.set(event.pointerId, point)
        press.current = pointers.current.size === 1 ? point : null
        if (pointers.current.size > 1) tap.current = null
      }}
      onPointerMove={(event) => {
        const previous = pointers.current.get(event.pointerId)
        if (!previous) return
        const point = { x: event.clientX, y: event.clientY }
        if (press.current && Math.hypot(point.x - press.current.x, point.y - press.current.y) > 8) {
          press.current = null
          tap.current = null
        }
        const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1]
        if (other) {
          const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y)
          const distance = Math.hypot(point.x - other.x, point.y - other.y)
          if (oldDistance > 0) {
            zoom(viewRef.current.scale * distance / oldDistance, { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 })
            update({ ...viewRef.current, x: viewRef.current.x + (point.x - previous.x) / 2, y: viewRef.current.y + (point.y - previous.y) / 2 })
          }
        } else if (viewRef.current.scale > 1) {
          update({ ...viewRef.current, x: viewRef.current.x + point.x - previous.x, y: viewRef.current.y + point.y - previous.y })
        }
        pointers.current.set(event.pointerId, point)
      }}
      onPointerUp={(event) => {
        pointers.current.delete(event.pointerId)
        if (event.pointerType === 'touch' && press.current) {
          const point = { x: event.clientX, y: event.clientY }
          const last = tap.current
          if (last && Date.now() - last.time < 350 && Math.hypot(point.x - last.point.x, point.y - last.point.y) < 30) {
            toggle(point)
            tap.current = null
          } else tap.current = { time: Date.now(), point }
        }
        press.current = null
      }}
      onPointerCancel={(event) => { pointers.current.delete(event.pointerId); press.current = null; tap.current = null }}
      onLostPointerCapture={(event) => pointers.current.delete(event.pointerId)}
    >
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        draggable={false}
        className="product-detail-lightbox__image"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      />
    </div>
  )
}
