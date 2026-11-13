import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProductSpinViewer } from './ProductSpinViewer'

const frames = Array.from(
  { length: 36 },
  (_, index) => `https://cdn.example.com/360/X/360_X_${String(index + 1).padStart(2, '0')}.jpg?v=0123456789ab`,
)

const surface = () => screen.getByRole('img', { name: '360° view of Chair' })
const frameNumber = () => Number(surface().dataset.frame)
const shownSrc = () => surface().querySelector('img')?.getAttribute('src')
const rotateLeft = () => screen.getByRole('button', { name: 'Rotate left' })
const rotateRight = () => screen.getByRole('button', { name: 'Rotate right' })

function loadEveryFrame() {
  screen.getByTestId('spin-preload').querySelectorAll('img').forEach((image) => fireEvent.load(image))
}

function reducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ProductSpinViewer', () => {
  it('renders only with exactly 36 frames', () => {
    const { container, rerender } = render(<ProductSpinViewer images={frames.slice(0, 35)} productName="Chair" />)
    expect(container).toBeEmptyDOMElement()

    rerender(<ProductSpinViewer images={[...frames, frames[0]]} productName="Chair" />)
    expect(container).toBeEmptyDOMElement()

    rerender(<ProductSpinViewer images={frames} productName="Chair" />)
    expect(surface()).toHaveAttribute('tabindex', '0')
    expect(shownSrc()).toBe(frames[0])
  })

  it('shows frame 1 at once and loads the other frames with a progress bar', () => {
    render(<ProductSpinViewer images={frames} productName="Chair" autoRotate={false} />)

    expect(shownSrc()).toBe(frames[0])
    const progress = screen.getByRole('progressbar', { name: 'Loading 360° view' })
    expect(progress).toHaveAttribute('aria-valuenow', '0')
    const preloads = screen.getByTestId('spin-preload').querySelectorAll('img')
    expect([...preloads].map((image) => image.getAttribute('src'))).toEqual(frames)

    fireEvent.load(preloads[0])
    fireEvent.error(preloads[1]) // A failed frame must not keep the bar up for ever.
    expect(progress).toHaveAttribute('aria-valuenow', '2')

    loadEveryFrame()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('turns one frame per 12 px of drag and loops', () => {
    render(<ProductSpinViewer images={frames} productName="Chair" autoRotate={false} />)

    fireEvent.pointerDown(surface(), { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 200 })
    expect(surface()).toHaveClass('product-spin__surface--dragging')
    fireEvent.pointerMove(surface(), { pointerId: 1, clientX: 211 })
    expect(frameNumber()).toBe(1)
    fireEvent.pointerMove(surface(), { pointerId: 1, clientX: 236 })
    expect(frameNumber()).toBe(4)
    expect(shownSrc()).toBe(frames[3])
    // Back past the start wraps to the last frame.
    fireEvent.pointerMove(surface(), { pointerId: 1, clientX: 188 })
    expect(frameNumber()).toBe(36)
    fireEvent.pointerUp(surface(), { pointerId: 1, clientX: 188 })
    expect(surface()).not.toHaveClass('product-spin__surface--dragging')

    // After the drag has ended, moving the pointer does nothing.
    fireEvent.pointerMove(surface(), { pointerId: 1, clientX: 400 })
    expect(frameNumber()).toBe(36)
  })

  it('ignores a right-button mouse drag', () => {
    render(<ProductSpinViewer images={frames} productName="Chair" autoRotate={false} />)
    fireEvent.pointerDown(surface(), { pointerId: 1, pointerType: 'mouse', button: 2, clientX: 200 })
    fireEvent.pointerMove(surface(), { pointerId: 1, clientX: 260 })
    expect(frameNumber()).toBe(1)
  })

  it('steps and loops with the arrow keys and the buttons, without moving the page gallery', () => {
    const outerKeyDown = vi.fn()
    render(
      <div onKeyDown={outerKeyDown}>
        <ProductSpinViewer images={frames} productName="Chair" autoRotate={false} />
      </div>,
    )

    fireEvent.keyDown(surface(), { key: 'ArrowLeft' })
    expect(frameNumber()).toBe(36)
    fireEvent.keyDown(surface(), { key: 'ArrowRight' })
    expect(frameNumber()).toBe(1)
    fireEvent.keyDown(surface(), { key: 'ArrowRight' })
    expect(frameNumber()).toBe(2)
    expect(outerKeyDown).not.toHaveBeenCalled()

    fireEvent.click(rotateLeft())
    fireEvent.click(rotateLeft())
    expect(frameNumber()).toBe(36)
    for (let step = 0; step < 36; step += 1) fireEvent.click(rotateRight())
    expect(frameNumber()).toBe(36)
  })

  it('turns once, slowly, after every frame has loaded, then stops', () => {
    vi.useFakeTimers()
    reducedMotion(false)
    render(<ProductSpinViewer images={frames} productName="Chair" />)

    act(() => { vi.advanceTimersByTime(1000) })
    expect(frameNumber()).toBe(1) // Not before the frames are there.

    loadEveryFrame()
    act(() => { vi.advanceTimersByTime(120) })
    expect(frameNumber()).toBe(2)
    act(() => { vi.advanceTimersByTime(120 * 35) })
    expect(frameNumber()).toBe(1) // One full turn, back at the start.
    act(() => { vi.advanceTimersByTime(5000) })
    expect(frameNumber()).toBe(1)
  })

  it('stops the turn on the first interaction', () => {
    vi.useFakeTimers()
    reducedMotion(false)
    render(<ProductSpinViewer images={frames} productName="Chair" />)
    loadEveryFrame()

    act(() => { vi.advanceTimersByTime(240) })
    expect(frameNumber()).toBe(3)
    fireEvent.pointerDown(surface(), { pointerId: 1, pointerType: 'touch', clientX: 50 })
    fireEvent.pointerUp(surface(), { pointerId: 1, clientX: 50 })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(frameNumber()).toBe(3)
  })

  it('never turns by itself with reduced motion', () => {
    vi.useFakeTimers()
    reducedMotion(true)
    render(<ProductSpinViewer images={frames} productName="Chair" />)
    loadEveryFrame()

    act(() => { vi.advanceTimersByTime(5000) })
    expect(frameNumber()).toBe(1)
  })
})
