import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ZoomableImage } from './ZoomableImage'

function setup() {
  render(<ZoomableImage src="/image.webp" alt="Product render" />)
  const image = screen.getByAltText('Product render')
  const viewport = image.parentElement!
  Object.defineProperties(image, { clientWidth: { value: 400 }, clientHeight: { value: 300 } })
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 300 } as DOMRect)
  return { image, viewport }
}

describe('image zoom', () => {
  it('supports touch pinch and double tap without zoom buttons', () => {
    const { image, viewport } = setup()
    class TouchPointerEvent extends MouseEvent {
      pointerId: number
      pointerType = 'touch'
      constructor(type: string, init: PointerEventInit) {
        super(type, init)
        this.pointerId = init.pointerId ?? 0
      }
    }
    vi.stubGlobal('PointerEvent', TouchPointerEvent)
    Object.defineProperty(viewport, 'setPointerCapture', { value: vi.fn() })
    try {
      fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 100, clientY: 150 })
      fireEvent.pointerDown(viewport, { pointerId: 2, clientX: 300, clientY: 150 })
      fireEvent.pointerMove(viewport, { pointerId: 2, clientX: 500, clientY: 150 })
      expect(image.style.transform).toContain('scale(2)')
      fireEvent.pointerUp(viewport, { pointerId: 1 })
      fireEvent.pointerUp(viewport, { pointerId: 2 })
      for (let tap = 0; tap < 2; tap++) {
        fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 150 })
        fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 200, clientY: 150 })
      }
      expect(image.style.transform).toBe('translate(0px, 0px) scale(1)')
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('zooms with the wheel, limits magnification, and restores the fitted image', () => {
    const { image, viewport } = setup()
    expect(fireEvent.wheel(viewport, { deltaY: -10000, clientX: 200, clientY: 150 })).toBe(false)
    expect(image.style.transform).toContain('scale(5)')
    fireEvent.wheel(viewport, { deltaY: 10000, clientX: 200, clientY: 150 })
    expect(image.style.transform).toBe('translate(0px, 0px) scale(1)')
  })

  it('toggles zoom on double click and bounds dragging to the image edges', () => {
    const { image, viewport } = setup()
    vi.stubGlobal('PointerEvent', MouseEvent)
    Object.defineProperty(viewport, 'setPointerCapture', { value: vi.fn() })
    try {
      fireEvent.doubleClick(viewport, { clientX: 200, clientY: 150 })
      expect(image.style.transform).toContain('scale(2.5)')
      fireEvent.pointerDown(viewport, { button: 0, clientX: 200, clientY: 150 })
      fireEvent.pointerMove(viewport, { clientX: 1200, clientY: 1150 })
      expect(image.style.transform).toBe('translate(300px, 225px) scale(2.5)')
      fireEvent.pointerUp(viewport)
      fireEvent.doubleClick(viewport, { clientX: 200, clientY: 150 })
      expect(image.style.transform).toBe('translate(0px, 0px) scale(1)')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
