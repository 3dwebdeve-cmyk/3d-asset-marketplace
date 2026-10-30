import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ProductImageGallery } from './ProductImageGallery'

vi.mock('../../components/viewer/LazyModelViewer', () => ({
  LazyModelViewer: () => <div data-testid="model-preview"><canvas tabIndex={0} /></div>,
}))

const images = [1, 2].map((number) => ({
  id: String(number), image_url: `https://example.com/render-${number}.webp`,
  display_order: number, is_primary: false, created_at: '',
}))
const defaults = {
  productName: 'Chair', thumbnail: '', images,
  previewModelUrl: 'https://example.com/preview.glb',
  previewVideoUrl: 'https://example.com/preview.mp4', showPreviewModeThumbs: true,
}
const stage = () => screen.getByRole('region', { name: 'Chair media gallery' })
const next = () => screen.getByRole('button', { name: 'Next preview' })
const previous = () => screen.getByRole('button', { name: 'Previous preview' })
const counter = () => screen.getByRole('status')

function animationFrames() {
  let now = performance.now()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  let id = 0
  const pending = new Map<number, FrameRequestCallback>()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    pending.set(++id, callback)
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frame) => { pending.delete(frame) })
  return (milliseconds: number) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 16) {
      now += 16
      const callbacks = [...pending.values()]
      pending.clear()
      callbacks.forEach((callback) => callback(now))
    }
  }
}

describe('product gallery navigation', () => {
  it('smoothly scrolls overflowing thumbnails with the vertical mouse wheel', () => {
    const advance = animationFrames()
    render(<ProductImageGallery {...defaults} />)
    const strip = screen.getByRole('list', { name: 'Product image thumbnails' })
    Object.defineProperties(strip, {
      scrollWidth: { value: 1000 }, clientWidth: { value: 300 },
    })
    expect(fireEvent.wheel(strip, { deltaY: 100 })).toBe(false)
    advance(32)
    expect(strip.scrollLeft).toBeGreaterThan(0)
    expect(strip.scrollLeft).toBeLessThan(100)
    fireEvent.wheel(strip, { deltaY: 100 })
    advance(500)
    expect(strip.scrollLeft).toBe(200)
    strip.scrollLeft = 200
    fireEvent.wheel(strip, { deltaY: -3, deltaMode: 1 })
    advance(500)
    expect(strip.scrollLeft).toBe(152)
    expect(counter()).toHaveTextContent('1 / 4')
  })

  it('scrolls thumbnails when the wheel is over the gallery heading or navigation', () => {
    const advance = animationFrames()
    render(<ProductImageGallery {...defaults} />)
    const strip = screen.getByRole('list', { name: 'Product image thumbnails' })
    Object.defineProperties(strip, {
      scrollWidth: { value: 1000 }, clientWidth: { value: 300 },
    })
    expect(fireEvent.wheel(screen.getByRole('heading', { name: 'Gallery' }), { deltaY: 100 })).toBe(false)
    advance(500)
    expect(strip.scrollLeft).toBe(100)
    strip.scrollLeft = 200
    expect(fireEvent.wheel(screen.getByRole('button', { name: 'Previous gallery item' }), { deltaY: -100 })).toBe(false)
    advance(500)
    expect(strip.scrollLeft).toBe(100)
    expect(counter()).toHaveTextContent('1 / 4')
  })

  it('stops easing for direct interaction and clamps scrolling at the last thumbnail', () => {
    const advance = animationFrames()
    const { unmount } = render(<ProductImageGallery {...defaults} />)
    const strip = screen.getByRole('list', { name: 'Product image thumbnails' })
    Object.defineProperties(strip, {
      scrollWidth: { value: 1000 }, clientWidth: { value: 300 },
    })
    fireEvent.wheel(strip, { deltaY: 100 })
    advance(32)
    fireEvent.pointerDown(strip)
    const stoppedAt = strip.scrollLeft
    advance(500)
    expect(strip.scrollLeft).toBe(stoppedAt)
    fireEvent.wheel(strip, { deltaY: 2000 })
    advance(500)
    expect(strip.scrollLeft).toBe(700)
    fireEvent.wheel(strip, { deltaY: -100 })
    unmount()
    const unmountedAt = strip.scrollLeft
    advance(500)
    expect(strip.scrollLeft).toBe(unmountedAt)
  })

  it('leaves wheel scrolling to the page at the strip edges, without overflow, and during zoom', () => {
    render(<ProductImageGallery {...defaults} />)
    const strip = screen.getByRole('list', { name: 'Product image thumbnails' })
    Object.defineProperties(strip, {
      scrollWidth: { configurable: true, value: 1000 }, clientWidth: { value: 300 },
    })
    const scrollBy = vi.fn()
    strip.scrollBy = scrollBy
    expect(fireEvent.wheel(strip, { deltaY: -100 })).toBe(true)
    strip.scrollLeft = 700
    expect(fireEvent.wheel(strip, { deltaY: 100 })).toBe(true)
    strip.scrollLeft = 200
    expect(fireEvent.wheel(strip, { deltaY: 100, ctrlKey: true })).toBe(true)
    expect(fireEvent.wheel(strip, { deltaX: 100, deltaY: 10 })).toBe(true)
    Object.defineProperty(strip, 'scrollWidth', { value: 300 })
    expect(fireEvent.wheel(strip, { deltaY: 100 })).toBe(true)
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('respects reduced motion when scrolling thumbnails', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    try {
      render(<ProductImageGallery {...defaults} />)
      const strip = screen.getByRole('list', { name: 'Product image thumbnails' })
      Object.defineProperties(strip, {
        scrollWidth: { value: 1000 }, clientWidth: { value: 300 },
      })
      fireEvent.wheel(strip, { deltaY: 1, deltaMode: 2 })
      expect(strip.scrollLeft).toBe(300)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('cycles through model, video and renders in both directions, and returns using the 3D thumbnail', async () => {
    const user = userEvent.setup()
    render(<ProductImageGallery {...defaults} />)
    expect(counter()).toHaveTextContent('1 / 4')
    await user.click(next())
    expect(screen.getByLabelText('Preview video of Chair')).toBeInTheDocument()
    expect(counter()).toHaveTextContent('2 / 4')
    await user.click(next())
    expect(within(stage()).getByAltText('Chair 3D model, image 1')).toBeInTheDocument()
    expect(counter()).toHaveTextContent('3 / 4')
    await user.click(next())
    expect(counter()).toHaveTextContent('4 / 4')
    await user.click(next())
    expect(screen.getByTestId('model-preview')).toBeInTheDocument()
    await user.click(previous())
    expect(counter()).toHaveTextContent('4 / 4')
    await user.click(previous())
    expect(counter()).toHaveTextContent('3 / 4')
    await user.click(previous())
    expect(counter()).toHaveTextContent('2 / 4')
    await user.click(screen.getByRole('button', { name: 'Show 3D preview' }))
    expect(counter()).toHaveTextContent('1 / 4')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('wraps backwards to video when there are no images', async () => {
    render(<ProductImageGallery {...defaults} images={[]} />)
    await userEvent.click(previous())
    expect(counter()).toHaveTextContent('2 / 2')
    await userEvent.click(next())
    expect(counter()).toHaveTextContent('1 / 2')
  })

  it('hides navigation for a single preview or empty gallery', () => {
    const { rerender } = render(<ProductImageGallery {...defaults} images={[]} previewVideoUrl="" />)
    expect(screen.queryByRole('button', { name: 'Next preview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    rerender(<ProductImageGallery {...defaults} images={[]} previewVideoUrl="" previewModelUrl="" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('supports focused stage arrow keys without consuming viewer or video keys', () => {
    render(<ProductImageGallery {...defaults} />)
    fireEvent.keyDown(screen.getByTestId('model-preview').querySelector('canvas')!, { key: 'ArrowRight' })
    expect(counter()).toHaveTextContent('1 / 4')
    stage().focus()
    fireEvent.keyDown(stage(), { key: 'ArrowRight' })
    expect(counter()).toHaveTextContent('2 / 4')
    fireEvent.keyDown(screen.getByLabelText('Preview video of Chair'), { key: 'ArrowRight' })
    expect(counter()).toHaveTextContent('2 / 4')
    fireEvent.keyDown(stage(), { key: 'ArrowLeft' })
    expect(counter()).toHaveTextContent('1 / 4')
  })

  it('swipes renders, ignores vertical gestures and model drags, and suppresses the swipe click', async () => {
    render(<ProductImageGallery {...defaults} />)
    const swipe = (target: HTMLElement, x: number, y: number) => {
      fireEvent.touchStart(target, { touches: [{ clientX: 200, clientY: 200 }] })
      fireEvent.touchEnd(target, { touches: [], changedTouches: [{ clientX: x, clientY: y }] })
    }
    swipe(screen.getByTestId('model-preview'), 50, 200)
    expect(counter()).toHaveTextContent('1 / 4')
    await userEvent.click(screen.getByRole('button', { name: 'Show image 1 of 2' }))
    const imageButton = screen.getByRole('button', { name: 'View larger image of Chair' })
    swipe(imageButton, 190, 60)
    expect(counter()).toHaveTextContent('3 / 4')
    swipe(imageButton, 50, 200)
    fireEvent.click(imageButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(counter()).toHaveTextContent('4 / 4')
    swipe(imageButton, 300, 200)
    expect(counter()).toHaveTextContent('3 / 4')
  })

  it('keeps lightbox arrows within images instead of switching media behind the dialog', async () => {
    const user = userEvent.setup()
    render(<ProductImageGallery {...defaults} />)
    await user.click(screen.getByRole('button', { name: 'Show image 1 of 2' }))
    await user.click(screen.getByRole('button', { name: 'View larger image of Chair' }))
    const dialog = screen.getByRole('dialog')
    await user.keyboard('{ArrowLeft}')
    expect(within(dialog).getByAltText('Chair 3D model, image 2')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Next image' }))
    expect(within(dialog).getByAltText('Chair 3D model, image 1')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(counter()).toHaveTextContent('3 / 4')
  })
})
