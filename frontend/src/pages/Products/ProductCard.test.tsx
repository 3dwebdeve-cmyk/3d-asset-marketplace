import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { PublicProduct } from '../../types/product'
import { ProductCard } from './ProductCard'

vi.mock('../../components/wishlist/WishlistToggle', () => ({ WishlistToggle: () => null }))

const product: PublicProduct = {
  id: 'b3d66e20-e133-4506-a6c5-a47d2ee5cd00',
  name: 'Oak Chair',
  slug: 'oak-chair',
  short_description: '',
  price: '29.99',
  currency: 'USD',
  discount_price: null,
  thumbnail: 'https://cdn.example.com/thumb.jpg',
  software_used: '',
  category: { id: '44bba207-8a0c-490d-abdf-5a383ed2111b', name: 'Furniture', slug: 'furniture' },
  license_type: 'standard',
  average_rating: '0.00',
  review_count: 0,
  total_downloads: 0,
  created_at: '2026-11-13T00:00:00Z',
}

function renderCard(overrides: Partial<PublicProduct>) {
  return render(
    <MemoryRouter>
      <ProductCard product={{ ...product, ...overrides }} />
    </MemoryRouter>,
  )
}

describe('ProductCard 360° badge', () => {
  it('shows the badge only when the product has a 360° view', () => {
    const { unmount } = renderCard({ has_360: true })
    expect(screen.getByText('360°')).toBeInTheDocument()
    unmount()

    renderCard({ has_360: false })
    expect(screen.queryByText('360°')).not.toBeInTheDocument()
  })
})
