import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProductImagePreview } from './ProductImagePreview'

afterEach(() => vi.unstubAllGlobals())

const colours = { left: 'rgb(16, 32, 48)', right: 'rgb(64, 80, 96)' }

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

describe('product image backdrop', () => {
  it('fills the side gaps of a portrait render with its stored colours', () => {
    const src = 'https://images.example.com/render.jpg'
    const { container } = render(
      <ProductImagePreview src={src} alt="Product render" sideColours={colours} onError={vi.fn()} />,
    )
    const { image } = loadImage(400, 800, 900, 500)
    const left = container.querySelector('.product-detail-stage__image-edge--left') as HTMLElement
    const right = container.querySelector('.product-detail-stage__image-edge--right') as HTMLElement
    expect(left.style.backgroundColor).toBe('rgb(16, 32, 48)')
    expect(right.style.backgroundColor).toBe('rgb(64, 80, 96)')
    expect(left).toHaveAttribute('aria-hidden', 'true')
    expect(image).toHaveAttribute('src', src)
    expect(image).not.toHaveAttribute('crossorigin')
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('shows only the neutral backdrop when no colours are stored', () => {
    const { container } = render(
      <ProductImagePreview src="/old.jpg" alt="Product render" sideColours={null} onError={vi.fn()} />,
    )
    loadImage(400, 800, 900, 500)
    expect(container.querySelector('.product-detail-stage__image-edge')).not.toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeInTheDocument()
  })

  it('leaves top and bottom letterboxing on the neutral backdrop', () => {
    const { container } = render(
      <ProductImagePreview src="/wide.jpg" alt="Product render" sideColours={colours} onError={vi.fn()} />,
    )
    loadImage(1200, 400, 300, 500)
    expect(container.querySelector('.product-detail-stage__image-edge')).not.toBeInTheDocument()
  })

  it('moves the side fills when a resize changes the gap direction', () => {
    let resize: () => void = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback }
      observe() {}
      disconnect = disconnect
    })
    const { container, unmount } = render(
      <ProductImagePreview src="/resize.jpg" alt="Product render" sideColours={colours} onError={vi.fn()} />,
    )
    const { bounds } = loadImage(1200, 400, 300, 500)
    expect(container.querySelector('.product-detail-stage__image-edge')).not.toBeInTheDocument()
    bounds.mockReturnValue({ width: 1800, height: 400 } as DOMRect)
    act(() => resize())
    expect(container.querySelectorAll('.product-detail-stage__image-edge')).toHaveLength(2)
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })

  it('clears the side fills while a different image loads and reports errors', () => {
    const onError = vi.fn()
    const { container, rerender } = render(
      <ProductImagePreview key="first" src="/first.jpg" alt="Product render" sideColours={colours} onError={onError} />,
    )
    loadImage(400, 800, 900, 500)
    expect(container.querySelector('.product-detail-stage__image-edge')).toBeInTheDocument()
    rerender(
      <ProductImagePreview key="second" src="/second.jpg" alt="Product render" sideColours={colours} onError={onError} />,
    )
    expect(container.querySelector('.product-detail-stage__image-edge')).not.toBeInTheDocument()
    fireEvent.error(screen.getByRole('img', { name: 'Product render' }))
    expect(onError).toHaveBeenCalledOnce()
  })
})
