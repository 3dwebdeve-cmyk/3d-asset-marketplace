import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProductImagePreview } from './ProductImagePreview'

afterEach(() => vi.unstubAllGlobals())

function loadImage(width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const image = screen.getByRole('img', { name: 'Product render' }) as HTMLImageElement
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: height },
  })
  const bounds = vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({ width: viewportWidth, height: viewportHeight } as DOMRect)
  fireEvent.load(image)
  return { image, bounds }
}

describe('product image background blending', () => {
  it('fits a complete portrait image and uses the same source for an accessible decorative backdrop', () => {
    const src = 'https://images.example.com/render.jpg'
    const { container } = render(<ProductImagePreview src={src} alt="Product render" onError={vi.fn()} />)
    const { image } = loadImage(400, 800, 900, 500)
    expect(image.style.getPropertyValue('--preview-image-width')).toBe('250px')
    expect(image.style.getPropertyValue('--preview-image-height')).toBe('500px')
    expect(container.querySelector('.product-detail-stage__image-backdrop')).toHaveAttribute('src', src)
    expect(container.querySelector('.product-detail-stage__image-backdrop')).toHaveAttribute('aria-hidden', 'true')
    expect(image).toHaveAttribute('src', src)
    expect(image).not.toHaveAttribute('crossorigin')
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('keeps the blend aligned with a wide image after resizing', () => {
    let resize: () => void = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback }
      observe() {}
      disconnect = disconnect
    })
    const { unmount } = render(<ProductImagePreview src="/wide.jpg" alt="Product render" onError={vi.fn()} />)
    const { image, bounds } = loadImage(1200, 400, 300, 500)
    expect(image.style.getPropertyValue('--preview-image-width')).toBe('300px')
    expect(image.style.getPropertyValue('--preview-image-height')).toBe('100px')
    bounds.mockReturnValue({ width: 1800, height: 400 } as DOMRect)
    act(() => resize())
    expect(image.style.getPropertyValue('--preview-image-width')).toBe('1200px')
    expect(image.style.getPropertyValue('--preview-image-height')).toBe('400px')
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })

  it('clears the previous blend dimensions while a different image loads and reports errors', () => {
    const onError = vi.fn()
    const { container, rerender } = render(<ProductImagePreview key="first" src="/first.jpg" alt="Product render" onError={onError} />)
    loadImage(400, 800, 900, 500)
    expect(container.querySelector('.product-detail-stage__image-preview--matched')).toBeInTheDocument()
    rerender(<ProductImagePreview key="second" src="/second.jpg" alt="Product render" onError={onError} />)
    expect(container.querySelector('.product-detail-stage__image-preview--matched')).not.toBeInTheDocument()
    expect(container.querySelector('.product-detail-stage__image-backdrop')).toHaveAttribute('src', '/second.jpg')
    fireEvent.error(screen.getByRole('img', { name: 'Product render' }))
    expect(onError).toHaveBeenCalledOnce()
  })
})
