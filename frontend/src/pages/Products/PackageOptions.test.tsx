import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as cartApi from '../../api/cartApi'
import * as downloadsApi from '../../api/downloadsApi'
import * as paymentsApi from '../../api/paymentsApi'
import { useAuthStore } from '../../store/authStore'
import { createTestQueryClient, resetAuthStore, testUser } from '../../test/test-utils'
import type { Cart, CartItem } from '../../types/cart'
import type { DownloadEntitlement } from '../../types/download'
import type { PublicProductPackage } from '../../types/product'
import { PackageOptions } from './PackageOptions'

vi.mock('../../api/cartApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/cartApi')>('../../api/cartApi')
  return { ...actual, getCart: vi.fn(), addCartItem: vi.fn() }
})

vi.mock('../../api/downloadsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/downloadsApi')>('../../api/downloadsApi')
  return { ...actual, listDownloadEntitlements: vi.fn() }
})

vi.mock('../../api/paymentsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/paymentsApi')>('../../api/paymentsApi')
  return { ...actual, createCheckoutSession: vi.fn() }
})

const PRODUCT_ID = 'chair-id'

function pkg(kind: PublicProductPackage['kind'], label: string, price: string, extra: Partial<PublicProductPackage> = {}): PublicProductPackage {
  return {
    kind,
    label,
    description: `${label} contents.`,
    file_size: 2 * 1024 * 1024,
    price,
    discount_price: null,
    effective_price: price,
    sale_ends_at: null,
    ...extra,
  }
}

const PACKAGES = [
  pkg('with_light_rig', 'With Light Rig', '19.00', { discount_price: '15.00', effective_price: '15.00' }),
  pkg('glb_only', 'GLB Only', '9.00'),
  pkg('whole', 'Whole File', '20.00'),
]

function product(packages = PACKAGES, bundleSaving: string | null = '4.00') {
  return { id: PRODUCT_ID, slug: 'oak-chair', name: 'Oak Chair', currency: 'USD', packages, bundle_saving: bundleSaving }
}

function cart(items: CartItem[] = []): Cart {
  return {
    id: 'cart-id',
    currency: 'USD',
    subtotal: '0.00',
    discount_amount: '0.00',
    total: '0.00',
    item_count: items.length,
    total_quantity: items.length,
    items,
  }
}

function entitlement(kinds: DownloadEntitlement['package_kinds']): DownloadEntitlement {
  return { product_type: 'product', product_id: PRODUCT_ID, title: 'Oak Chair', slug: 'oak-chair', package_kinds: kinds, files: [] }
}

function signIn() {
  useAuthStore.setState({ accessToken: 'access-token', user: testUser, isAuthenticated: true })
}

function renderOptions(props: Parameters<typeof PackageOptions>[0]) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/products/oak-chair']}>
        <PackageOptions {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  vi.mocked(cartApi.getCart).mockReset().mockResolvedValue(cart())
  vi.mocked(cartApi.addCartItem).mockReset().mockResolvedValue({
    id: 'line', product_type: 'product', product_id: PRODUCT_ID, package_kind: 'whole',
    quantity: 1, unit_price: '20.00', line_total: '20.00', catalog: null,
  })
  vi.mocked(downloadsApi.listDownloadEntitlements).mockReset().mockResolvedValue([])
  vi.mocked(paymentsApi.createCheckoutSession).mockReset()
})

describe('PackageOptions', () => {
  it('lists every package with its contents, size and price, the sale struck through', () => {
    renderOptions({ product: product(), isFree: false })

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('With Light Rig')).toBeInTheDocument()
    expect(within(rows[0]).getByText('With Light Rig contents.')).toBeInTheDocument()
    expect(within(rows[0]).getByText('2.0 MB')).toBeInTheDocument()
    expect(within(rows[0]).getByText('$15.00')).toBeInTheDocument()
    expect(within(rows[0]).getByText('$19.00').tagName).toBe('S')
    expect(within(rows[1]).getByText('$9.00')).toBeInTheDocument()
  })

  it('shows the Whole File saving only when there is one', () => {
    const { unmount } = renderOptions({ product: product(), isFree: false })
    // 4.00 saved on 24.00 bought apart.
    expect(screen.getByText('Everything in one download – save $4.00 (17%)')).toBeInTheDocument()
    unmount()

    renderOptions({ product: product(PACKAGES, null), isFree: false })
    expect(screen.queryByText(/Everything in one download/)).not.toBeInTheDocument()
  })

  it('adds up the ticked packages', async () => {
    const user = userEvent.setup()
    signIn()
    renderOptions({ product: product(), isFree: false })

    expect(screen.getByText('Tick the packages you want.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buy now' })).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'With Light Rig' }))
    await user.click(screen.getByRole('checkbox', { name: 'GLB Only' }))
    expect(screen.getByText('2 packages: $24.00')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'GLB Only' }))
    expect(screen.getByText('1 package: $15.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buy now' })).toBeEnabled()
  })

  it('adds one cart line per ticked package', async () => {
    const user = userEvent.setup()
    signIn()
    renderOptions({ product: product(), isFree: false })

    await user.click(screen.getByRole('checkbox', { name: 'GLB Only' }))
    await user.click(screen.getByRole('checkbox', { name: 'Whole File' }))
    await user.click(screen.getByRole('button', { name: 'Add selected to cart' }))

    await vi.waitFor(() => expect(cartApi.addCartItem).toHaveBeenCalledTimes(2))
    expect(cartApi.addCartItem).toHaveBeenCalledWith({ product_type: 'product', product_id: PRODUCT_ID, package_kind: 'glb_only', quantity: 1 })
    expect(cartApi.addCartItem).toHaveBeenCalledWith({ product_type: 'product', product_id: PRODUCT_ID, package_kind: 'whole', quantity: 1 })
  })

  it('buys the ticked packages at once', async () => {
    const user = userEvent.setup()
    signIn()
    vi.mocked(paymentsApi.createCheckoutSession).mockReturnValue(new Promise(() => {}))
    renderOptions({ product: product(), isFree: false })

    await user.click(screen.getByRole('checkbox', { name: 'Whole File' }))
    await user.click(screen.getByRole('button', { name: 'Buy now' }))

    await vi.waitFor(() =>
      expect(paymentsApi.createCheckoutSession).toHaveBeenCalledWith(expect.anything(), [
        { product_type: 'product', product_id: PRODUCT_ID, package_kind: 'whole' },
      ]),
    )
  })

  it('offers the download for an owned package and says when a package is in the cart', async () => {
    signIn()
    vi.mocked(downloadsApi.listDownloadEntitlements).mockResolvedValue([entitlement(['with_light_rig'])])
    vi.mocked(cartApi.getCart).mockResolvedValue(cart([
      { id: 'line', product_type: 'product', product_id: PRODUCT_ID, package_kind: 'glb_only', quantity: 1, unit_price: '9.00', line_total: '9.00', catalog: null },
    ]))
    renderOptions({ product: product(), isFree: false })

    const download = await screen.findByRole('link', { name: 'Download' })
    expect(download).toHaveAttribute('href', '/dashboard/downloads')
    expect(await screen.findByRole('link', { name: 'In cart' })).toHaveAttribute('href', '/cart')
    expect(screen.queryByRole('checkbox', { name: 'With Light Rig' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'GLB Only' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Whole File' })).toBeInTheDocument()
  })

  it('offers only downloads once the buyer owns Whole File', async () => {
    signIn()
    vi.mocked(downloadsApi.listDownloadEntitlements).mockResolvedValue([
      entitlement(['with_light_rig', 'without_light_rig', 'glb_only', 'environment', 'whole']),
    ])
    renderOptions({ product: product(), isFree: false })

    expect(await screen.findByText('You own every package of this model.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Download' })).toHaveLength(3)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buy now' })).not.toBeInTheDocument()
  })

  it('asks a visitor to sign in to buy', () => {
    renderOptions({ product: product(), isFree: false })

    expect(screen.getByRole('button', { name: 'Sign in to buy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buy now' })).not.toBeInTheDocument()
    expect(downloadsApi.listDownloadEntitlements).not.toHaveBeenCalled()
  })

  it('gives every package of a free model a direct download, with no cart', () => {
    const free = [pkg('glb_only', 'GLB Only', '0.00'), pkg('whole', 'Whole File', '0.00')]
    renderOptions({ product: product(free, null), isFree: true })

    const links = screen.getAllByRole('link', { name: 'Free download' })
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', expect.stringMatching(/\/api\/v1\/products\/oak-chair\/free-download\/\?package=glb_only$/))
    expect(links[1]).toHaveAttribute('href', expect.stringMatching(/\?package=whole$/))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /buy now|sign in to buy/i })).not.toBeInTheDocument()
  })

  it('says a model with no priced package is not for sale', () => {
    renderOptions({ product: product([], null), isFree: false })
    expect(screen.getByText('This model is not for sale yet.')).toBeInTheDocument()
  })
})
