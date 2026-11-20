import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProductImagePreview } from './ProductImagePreview'

describe('ProductImagePreview', () => {
  it('renders only the source photo', () => {
    const { container } = render(<ProductImagePreview src="/render.jpg" alt="Product render" onError={vi.fn()} />)
    const image = screen.getByRole('img', { name: 'Product render' })
    expect(container.children).toHaveLength(1)
    expect(container.firstElementChild).toBe(image)
    expect(image).toHaveAttribute('src', '/render.jpg')
  })

  it('reports image errors', () => {
    const onError = vi.fn()
    render(<ProductImagePreview src="/render.jpg" alt="Product render" onError={onError} />)
    fireEvent.error(screen.getByRole('img', { name: 'Product render' }))
    expect(onError).toHaveBeenCalledOnce()
  })
})
