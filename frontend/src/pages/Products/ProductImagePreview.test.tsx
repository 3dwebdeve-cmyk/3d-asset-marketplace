import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { backdropColour } from './backdropColour'
import { ProductImagePreview } from './ProductImagePreview'

const colours = { left: '#102030', right: '#102030' }

describe('backdropColour', () => {
  it('lightens the edge colour most of the way to white', () => {
    expect(backdropColour('#4f4f4f', '#4f4f4f')).toBe('rgb(202, 202, 202)')
  })

  it('averages the two sides into one colour', () => {
    expect(backdropColour('#000000', '#ffffff')).toBe('rgb(217, 217, 217)')
  })

  it('returns null for unusable colours', () => {
    expect(backdropColour('', '#ffffff')).toBeNull()
    expect(backdropColour('red', 'blue')).toBeNull()
  })
})

describe('product image backdrop', () => {
  it('paints the light backdrop colour before the image has loaded', () => {
    const src = 'https://images.example.com/render.jpg'
    const { container } = render(
      <ProductImagePreview src={src} alt="Product render" sideColours={colours} onError={vi.fn()} />,
    )
    const preview = container.querySelector<HTMLElement>('.product-detail-stage__image-preview')!
    expect(preview.style.background).toBe(backdropColour('#102030', '#102030'))
    const image = screen.getByRole('img', { name: 'Product render' })
    expect(image).toHaveAttribute('src', src)
    expect(image).not.toHaveAttribute('crossorigin')
  })

  it('keeps the neutral backdrop when no colours are stored', () => {
    const { container } = render(
      <ProductImagePreview src="/old.jpg" alt="Product render" sideColours={null} onError={vi.fn()} />,
    )
    const preview = container.querySelector<HTMLElement>('.product-detail-stage__image-preview')!
    expect(preview.getAttribute('style')).toBeNull()
  })

  it('reports image errors and drops the colour when the next image has none', () => {
    const onError = vi.fn()
    const { container, rerender } = render(
      <ProductImagePreview key="first" src="/first.jpg" alt="Product render" sideColours={colours} onError={onError} />,
    )
    expect(container.querySelector('.product-detail-stage__image-preview')!.getAttribute('style')).not.toBeNull()
    rerender(<ProductImagePreview key="second" src="/second.jpg" alt="Product render" sideColours={null} onError={onError} />)
    expect(container.querySelector('.product-detail-stage__image-preview')!.getAttribute('style')).toBeNull()
    fireEvent.error(screen.getByRole('img', { name: 'Product render' }))
    expect(onError).toHaveBeenCalledOnce()
  })
})
