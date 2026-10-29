import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as cartApi from '../../api/cartApi'
import * as downloadsApi from '../../api/downloadsApi'
import * as productsApi from '../../api/productsApi'
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

vi.mock('../../api/productsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/productsApi')>('../../api/productsApi')
  return { ...actual, claimFreeProduct: vi.fn() }
})

const FREE_ID = 'free-product-id'

function renderFreeCta() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/products/free-lamp']}>
        <Routes>
          <Route
            path="/products/free-lamp"
            element={
              <CommerceCtaGroup
                productType="product"
                productId={FREE_ID}
                productName="Free Lamp"
                productSlug="free-lamp"
                variant="buybox"
                isFree
              />
            }
          />
          <Route path="/dashboard/downloads" element={<div>My downloads</div>} />
        </Routes>
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
  vi.mocked(productsApi.claimFreeProduct).mockReset()
})

describe('free models', () => {
  it('offer one Download button, no Buy Now or cart, and go to Downloads without checkout', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({ accessToken: 'access-token', user: testUser, isAuthenticated: true })
    vi.mocked(productsApi.claimFreeProduct).mockResolvedValue({
      order_id: 'order-id',
      product_id: FREE_ID,
      created: true,
    })
    renderFreeCta()

    const download = await screen.findByRole('button', { name: 'Download free' })
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument()

    await user.click(download)

    await waitFor(() => expect(productsApi.claimFreeProduct).toHaveBeenCalledWith('free-lamp'))
    expect(await screen.findByText('My downloads')).toBeInTheDocument()
  })

  it('ask visitors to sign in to download', async () => {
    renderFreeCta()

    expect(await screen.findByText('Sign in to download')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument()
    expect(productsApi.claimFreeProduct).not.toHaveBeenCalled()
  })
})
