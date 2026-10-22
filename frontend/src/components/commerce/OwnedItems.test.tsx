import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as cartApi from '../../api/cartApi'
import * as downloadsApi from '../../api/downloadsApi'
import { useAuthStore } from '../../store/authStore'
import { createTestQueryClient, resetAuthStore, testUser } from '../../test/test-utils'
import { AddToCartButton } from '../cart/AddToCartButton'
import { CommerceCtaGroup } from './CommerceCtaGroup'

vi.mock('../../api/cartApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/cartApi')>('../../api/cartApi')
  return { ...actual, getCart: vi.fn() }
})

vi.mock('../../api/downloadsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/downloadsApi')>('../../api/downloadsApi')
  return { ...actual, listDownloadEntitlements: vi.fn() }
})

const OWNED_ID = 'owned-product-id'

function renderWithProviders(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

function signIn(role = testUser.role) {
  useAuthStore.setState({ accessToken: 'access-token', user: { ...testUser, role }, isAuthenticated: true })
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
  vi.mocked(downloadsApi.listDownloadEntitlements).mockReset()
  vi.mocked(downloadsApi.listDownloadEntitlements).mockResolvedValue([
    { product_type: 'product', product_id: OWNED_ID, title: 'Oak Chair', slug: 'oak-chair', files: [] },
  ])
})

describe('items the customer already owns', () => {
  it('offer the download instead of Buy Now and Add to cart', async () => {
    signIn()
    renderWithProviders(
      <CommerceCtaGroup productType="product" productId={OWNED_ID} productName="Oak Chair" productSlug="oak-chair" variant="buybox" />,
    )

    const download = await screen.findByRole('link', { name: 'Download' })
    expect(download).toHaveAttribute('href', '/dashboard/downloads')
    expect(screen.getByText('You already own this product.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add to cart/i })).not.toBeInTheDocument()
  })

  it('show "Owned" on product cards', async () => {
    signIn()
    renderWithProviders(
      <AddToCartButton productType="product" productId={OWNED_ID} productName="Oak Chair" variant="marketplace" />,
    )

    const owned = await screen.findByRole('link', { name: 'You own Oak Chair. Go to your downloads' })
    expect(owned).toHaveTextContent('Owned')
  })

  it('leave other items for sale', async () => {
    signIn()
    renderWithProviders(
      <CommerceCtaGroup productType="product" productId="other-id" productName="Desk" productSlug="desk" variant="buybox" />,
    )

    expect(await screen.findByRole('button', { name: /buy now/i })).toBeInTheDocument()
    await vi.waitFor(() => expect(downloadsApi.listDownloadEntitlements).toHaveBeenCalled())
    expect(screen.queryByText(/already own/)).not.toBeInTheDocument()
  })

  it('are not looked up for visitors or administrators', async () => {
    const visitor = renderWithProviders(
      <CommerceCtaGroup productType="product" productId={OWNED_ID} productName="Oak Chair" productSlug="oak-chair" />,
    )
    expect(screen.getByText('Sign in to buy')).toBeInTheDocument()
    visitor.unmount()

    signIn('Administrator')
    renderWithProviders(
      <CommerceCtaGroup productType="product" productId={OWNED_ID} productName="Oak Chair" productSlug="oak-chair" />,
    )
    expect(await screen.findByRole('button', { name: /buy now/i })).toBeInTheDocument()
    expect(downloadsApi.listDownloadEntitlements).not.toHaveBeenCalled()
  })
})
