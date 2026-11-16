import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { createTestQueryClient, resetAuthStore } from '../../test/test-utils'
import type { PublicProduct } from '../../types/product'
import { ProductCard } from './ProductCard'

function product(overrides: Partial<PublicProduct> = {}): PublicProduct {
  return {
    id: 'chair-id',
    name: 'Oak Chair',
    slug: 'oak-chair',
    short_description: '',
    price: '20.00',
    currency: 'USD',
    discount_price: null,
    is_free: false,
    thumbnail: '',
    software_used: '',
    formats: [],
    category: { id: 'cat-id', name: 'Furniture', slug: 'furniture' },
    license_type: 'standard',
    average_rating: '0.00',
    review_count: 0,
    total_downloads: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderCard(item: PublicProduct) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>
        <ProductCard product={item} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
})

describe('ProductCard 360° badge', () => {
  it('shows the badge only when the product has a 360° view', () => {
    const { unmount } = renderCard(product({ has_360: true }))
    expect(screen.getByText('360°')).toBeInTheDocument()
    unmount()

    renderCard(product({ has_360: false }))
    expect(screen.queryByText('360°')).not.toBeInTheDocument()
  })
})

describe('ProductCard price', () => {
  it('shows "From" the lowest package price when the model has several packages', () => {
    renderCard(product({ price_from: '9.00' }))
    expect(screen.getByText('From $ 9.00')).toBeInTheDocument()
    expect(screen.queryByText('$ 20.00')).not.toBeInTheDocument()
  })

  it('shows the price, with the sale, when the model has one package', () => {
    renderCard(product({ price_from: null, discount_price: '15.00' }))
    expect(screen.getByText('$ 15.00')).toBeInTheDocument()
    expect(screen.getByText('$ 20.00')).toBeInTheDocument()
    expect(screen.queryByText(/^From /)).not.toBeInTheDocument()
  })

  it('shows Free for a free model', () => {
    renderCard(product({ price: '0.00', is_free: true, price_from: null }))
    expect(screen.getByText('Free')).toBeInTheDocument()
  })
})
