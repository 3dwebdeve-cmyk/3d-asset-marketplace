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

describe('product image background matching', () => {
  it('extends only the left and right edges of a portrait image into the surrounding area', () => {
    const src = 'https://images.example.com/render.jpg'
    const { container } = render(<ProductImagePreview src={src} alt="Product render" onError={vi.fn()} />)
    expect(container.querySelector('svg')).not.toBeInTheDocument()
    const { image } = loadImage(400, 800, 900, 500)
    const strips = container.querySelectorAll('svg')
    expect([...strips].map((strip) => strip.getAttribute('viewBox'))).toEqual(['0 0 1 800', '399 0 1 800'])
    expect(strips[0]).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('svg image')).toHaveLength(2)
    expect(container.querySelector('svg image')).toHaveAttribute('href', src)
    expect(image).toHaveAttribute('src', src)
    expect(image).not.toHaveAttribute('crossorigin')
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('matches top/bottom letterboxing and updates the edge direction after a resize', () => {
    let resize: () => void = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback }
      observe() {}
      disconnect = disconnect
    })
    const { container, unmount } = render(<ProductImagePreview src="/wide.jpg" alt="Product render" onError={vi.fn()} />)
    const { bounds } = loadImage(1200, 400, 300, 500)
    expect([...container.querySelectorAll('svg')].map((strip) => strip.getAttribute('viewBox')))
      .toEqual(['0 0 1200 1', '0 399 1200 1'])
    bounds.mockReturnValue({ width: 1800, height: 400 } as DOMRect)
    act(() => resize())
    expect([...container.querySelectorAll('svg')].map((strip) => strip.getAttribute('viewBox')))
      .toEqual(['0 0 1 400', '1199 0 1 400'])
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })

  it('clears the previous edge colours while a different image loads and reports errors', () => {
    const onError = vi.fn()
    const { container, rerender } = render(<ProductImagePreview key="first" src="/first.jpg" alt="Product render" onError={onError} />)
    loadImage(400, 800, 900, 500)
    expect(container.querySelector('svg')).toBeInTheDocument()
    rerender(<ProductImagePreview key="second" src="/second.jpg" alt="Product render" onError={onError} />)
    expect(container.querySelector('svg')).not.toBeInTheDocument()
    fireEvent.error(screen.getByRole('img', { name: 'Product render' }))
    expect(onError).toHaveBeenCalledOnce()
  })
})
