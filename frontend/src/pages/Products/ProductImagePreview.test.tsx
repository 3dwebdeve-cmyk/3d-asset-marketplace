import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProductImagePreview } from './ProductImagePreview'

const colours = { left: 'rgb(16, 32, 48)', right: 'rgb(64, 80, 96)' }

describe('product image backdrop', () => {
  it('starts the side fills in the stored colours before the image has loaded', () => {
    const src = 'https://images.example.com/render.jpg'
    const { container } = render(
      <ProductImagePreview src={src} alt="Product render" sideColours={colours} aspectRatio={0.5} onError={vi.fn()} />,
    )
    const [left, right] = Array.from(container.querySelectorAll<HTMLElement>('.product-detail-stage__image-edge'))
    expect(left.getAttribute('style')).toContain('rgb(16, 32, 48)')
    expect(right.getAttribute('style')).toContain('rgb(64, 80, 96)')
    expect(left).toHaveAttribute('aria-hidden', 'true')
    const image = screen.getByRole('img', { name: 'Product render' })
    expect(image).toHaveAttribute('src', src)
    expect(image).not.toHaveAttribute('crossorigin')
    expect(image.style.aspectRatio).toContain('0.5')
  })

  it('shows only the neutral backdrop when no colours are stored', () => {
    const { container } = render(
      <ProductImagePreview src="/old.jpg" alt="Product render" sideColours={null} aspectRatio={0.5} onError={vi.fn()} />,
    )
    expect(container.querySelector('.product-detail-stage__image-edge')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Product render' }).style.aspectRatio).toBe('')
  })

  it('shows only the neutral backdrop for images stored before the aspect ratio was sampled', () => {
    const { container } = render(
      <ProductImagePreview src="/old.jpg" alt="Product render" sideColours={colours} aspectRatio={null} onError={vi.fn()} />,
    )
    expect(container.querySelector('.product-detail-stage__image-edge')).not.toBeInTheDocument()
    expect(container.querySelector('.product-detail-stage__image-preview--sided')).not.toBeInTheDocument()
  })

  it('reports image errors and swaps images without leftover fills', () => {
    const onError = vi.fn()
    const { container, rerender } = render(
      <ProductImagePreview key="first" src="/first.jpg" alt="Product render" sideColours={colours} aspectRatio={0.5} onError={onError} />,
    )
    expect(container.querySelectorAll('.product-detail-stage__image-edge')).toHaveLength(2)
    rerender(
      <ProductImagePreview key="second" src="/second.jpg" alt="Product render" sideColours={null} aspectRatio={null} onError={onError} />,
    )
    expect(container.querySelector('.product-detail-stage__image-edge')).not.toBeInTheDocument()
    fireEvent.error(screen.getByRole('img', { name: 'Product render' }))
    expect(onError).toHaveBeenCalledOnce()
  })
})
