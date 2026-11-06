import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as cartApi from '../../api/cartApi'
import * as downloadsApi from '../../api/downloadsApi'
import { useAuthStore } from '../../store/authStore'
import { createTestQueryClient, resetAuthStore, testUser } from '../../test/test-utils'
import { CommerceCtaGroup } from './CommerceCtaGroup'

vi.mock('../../api/cartApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/cartApi')>('../../api/cartApi')
  return { ...actual, getCart: vi.fn() }
})

vi.mock('../../api/downloadsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/downloadsApi')>('../../api/downloadsApi')
  return { ...actual, listDownloadEntitlements: vi.fn() }
})

function renderFreeCta() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/products/free-lamp']}>
        <CommerceCtaGroup
          productType="product"
          productId="free-product-id"
          productName="Free Lamp"
          productSlug="free-lamp"
          variant="buybox"
          isFree
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  vi.mocked(cartApi.getCart).mockResolvedValue({
    id: 'cart-id',
    currency: 'USD',
    subtotal: '0.00',
    discount_amount: '0.00',
    total: '0.00',
    item_count: 0,
    total_quantity: 0,
    items: [],
  })
  vi.mocked(downloadsApi.listDownloadEntitlements).mockResolvedValue([])
})

describe('free models', () => {
  it.each([
    ['visitors', false],
    ['signed-in customers', true],
  ])('give %s a direct download link, with no Buy Now or cart', async (_who, signedIn) => {
    if (signedIn) {
      useAuthStore.setState({ accessToken: 'access-token', user: testUser, isAuthenticated: true })
    }
    renderFreeCta()

    const download = await screen.findByRole('link', { name: 'Download free' })
    expect(download).toHaveAttribute('href', expect.stringMatching(/\/api\/v1\/products\/free-lamp\/free-download\/$/))
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument()
  })
})
