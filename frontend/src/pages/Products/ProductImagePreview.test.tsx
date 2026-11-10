import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { backdropColour } from './backdropColour'
import { ProductImagePreview } from './ProductImagePreview'

const colours = { left: '#102030', right: '#506070' }

describe('backdropColour', () => {
  it('keeps valid sampled colours for their respective sides', () => {
    expect(backdropColour('#4f4f4f')).toBe('#4f4f4f')
    expect(backdropColour(' #abcdef ')).toBe('#abcdef')
  })

  it('rejects unusable colours', () => {
    expect(backdropColour('')).toBeUndefined()
    expect(backdropColour('red')).toBeUndefined()
  })
})

describe('product image backdrop', () => {
  it('uses the image corners and stored colours on their respective sides', () => {
    const src = 'https://images.example.com/render.jpg'
    const { container } = render(
      <ProductImagePreview src={src} alt="Product render" sideColours={colours} onError={vi.fn()} />,
    )
    const left = container.querySelector<HTMLElement>('.product-detail-stage__corner--left')!
    const right = container.querySelector<HTMLElement>('.product-detail-stage__corner--right')!
    expect(left.style.backgroundColor).toBe('rgb(16, 32, 48)')
    expect(right.style.backgroundColor).toBe('rgb(80, 96, 112)')
    expect(left.style.backgroundImage).toContain(src)
    expect(right.style.backgroundImage).toContain(src)
    expect(left).toHaveAttribute('aria-hidden', 'true')
    const image = screen.getByRole('img', { name: 'Product render' })
    expect(image).toHaveAttribute('src', src)
    expect(image).not.toHaveAttribute('crossorigin')
  })

  it('uses the image corners for older images without stored colours', () => {
    const { container } = render(
      <ProductImagePreview src="/old.jpg" alt="Product render" sideColours={null} onError={vi.fn()} />,
    )
    const left = container.querySelector<HTMLElement>('.product-detail-stage__corner--left')!
    expect(left.style.backgroundColor).toBe('')
    expect(left.style.backgroundImage).toContain('/old.jpg')
  })

  it('reports image errors and drops the colour when the next image has none', () => {
    const onError = vi.fn()
    const { container, rerender } = render(
      <ProductImagePreview key="first" src="/first.jpg" alt="Product render" sideColours={colours} onError={onError} />,
    )
    expect((container.querySelector('.product-detail-stage__corner--left') as HTMLElement).style.backgroundColor).not.toBe('')
    rerender(<ProductImagePreview key="second" src="/second.jpg" alt="Product render" sideColours={null} onError={onError} />)
    expect((container.querySelector('.product-detail-stage__corner--left') as HTMLElement).style.backgroundColor).toBe('')
    expect((container.querySelector('.product-detail-stage__corner--left') as HTMLElement).style.backgroundImage).toContain('/second.jpg')
    fireEvent.error(screen.getByRole('img', { name: 'Product render' }))
    expect(onError).toHaveBeenCalledOnce()
  })
})
