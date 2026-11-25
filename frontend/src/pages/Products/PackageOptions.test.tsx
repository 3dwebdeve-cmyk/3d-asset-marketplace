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
import type { BundleOffer, PublicProductPackage } from '../../types/product'
import { PackageOptions } from './PackageOptions'

vi.mock('../../api/cartApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/cartApi')>('../../api/cartApi')
  return { ...actual, getCart: vi.fn(), addCartItem: vi.fn(), getBundleQuote: vi.fn() }
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

// The API lists only the single packages: Whole File is sold as All variations.
const PACKAGES = [
  pkg('with_light_rig', 'With Light Rig', '19.00', { discount_price: '15.00', effective_price: '15.00' }),
  pkg('glb_only', 'GLB Only', '9.00'),
  pkg('environment', 'With Environment', '15.00'),
]

// 15 + 9 + 15 = 39 at the packages' prices now; 25% off is 29.25, which rounds to 29 in whole dollars.
const OFFERED: BundleOffer = {
  eligible: true,
  reason: '',
  kinds: ['with_light_rig', 'glb_only', 'environment'],
  subtotal: '39.00',
  price: '29.00',
}
const NOT_OFFERED: BundleOffer = { eligible: false, reason: 'A package of this model is on sale.', kinds: [], subtotal: '0.00', price: '0.00' }

function product(packages = PACKAGES, bundle: BundleOffer = OFFERED) {
  return { id: PRODUCT_ID, slug: 'oak-chair', name: 'Oak Chair', currency: 'USD', packages, bundle }
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

function allVariations(): HTMLElement {
  return document.querySelector('.package-options__bundle') as HTMLElement
}

function singlesFooter(): HTMLElement {
  return document.querySelector('.package-options__footer') as HTMLElement
}

beforeEach(() => {
  resetAuthStore()
  vi.mocked(cartApi.getCart).mockReset().mockResolvedValue(cart())
  vi.mocked(cartApi.addCartItem).mockReset().mockResolvedValue({
    id: 'line', product_type: 'product', product_id: PRODUCT_ID, package_kind: 'bundle',
    quantity: 1, unit_price: '29.00', line_total: '29.00', catalog: null,
  })
  vi.mocked(cartApi.getBundleQuote).mockReset()
  vi.mocked(downloadsApi.listDownloadEntitlements).mockReset().mockResolvedValue([])
  vi.mocked(paymentsApi.createCheckoutSession).mockReset()
})

describe('PackageOptions', () => {
  it('lists every single package with its contents, size and price, the sale struck through', () => {
    renderOptions({ product: product(), isFree: false })

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('With Light Rig')).toBeInTheDocument()
    expect(within(rows[0]).getByText('With Light Rig contents.')).toBeInTheDocument()
    expect(within(rows[0]).getByText('2.0 MB')).toBeInTheDocument()
    expect(within(rows[0]).getByText('$15.00')).toBeInTheDocument()
    expect(within(rows[0]).getByText('$19.00').tagName).toBe('S')
    expect(within(rows[1]).getByText('$9.00')).toBeInTheDocument()
    expect(screen.queryByText('Whole File')).not.toBeInTheDocument()
  })

  it('offers All variations at the bundle price, with the packages it covers struck through', () => {
    renderOptions({ product: product(), isFree: false })

    const offer = allVariations()
    expect(within(offer).getByText('All variations')).toBeInTheDocument()
    expect(within(offer).getByText('3 packages in one download (the whole zip), with 25% off the total.')).toBeInTheDocument()
    expect(within(offer).getByText('$39.00').tagName).toBe('S')
    expect(within(offer).getByText('$29.00')).toBeInTheDocument()
  })

  it('hides All variations when the bundle is not offered', () => {
    renderOptions({ product: product(PACKAGES, NOT_OFFERED), isFree: false })

    expect(allVariations()).toBeNull()
    expect(screen.queryByText('All variations')).not.toBeInTheDocument()
  })

  it('keeps the All variations card to text: no buttons of its own', async () => {
    signIn()
    renderOptions({ product: product(), isFree: false })

    await screen.findByText('All variations')
    expect(within(allVariations()).queryByRole('button')).not.toBeInTheDocument()
    expect(within(allVariations()).queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows no buy button until a package is ticked', async () => {
    const user = userEvent.setup()
    signIn()
    renderOptions({ product: product(), isFree: false })

    expect(screen.getByText('Tick the packages you want.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buy now' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'GLB Only' }))
    expect(within(singlesFooter()).getByRole('button', { name: 'Buy now' })).toBeEnabled()
  })

  it('asks a visitor to sign in once a package is ticked', async () => {
    const user = userEvent.setup()
    renderOptions({ product: product(), isFree: false })

    expect(screen.queryByRole('button', { name: 'Sign in to buy' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'GLB Only' }))
    expect(within(singlesFooter()).getByRole('button', { name: 'Sign in to buy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buy now' })).not.toBeInTheDocument()
  })

  it('adds up the ticked packages', async () => {
    const user = userEvent.setup()
    signIn()
    renderOptions({ product: product(), isFree: false })

    await user.click(screen.getByRole('checkbox', { name: 'With Light Rig' }))
    await user.click(screen.getByRole('checkbox', { name: 'GLB Only' }))
    expect(screen.getByText('2 packages: $24.00')).toBeInTheDocument()
    expect(allVariations()).not.toHaveClass('package-options__bundle--active')

    await user.click(screen.getByRole('checkbox', { name: 'GLB Only' }))
    expect(screen.getByText('1 package: $15.00')).toBeInTheDocument()
  })

  it('takes the 25% off and states the price to pay once every package is ticked', async () => {
    const user = userEvent.setup()
    signIn()
    renderOptions({ product: product(), isFree: false })

    await user.click(screen.getByRole('checkbox', { name: 'With Light Rig' }))
    await user.click(screen.getByRole('checkbox', { name: 'GLB Only' }))
    await user.click(screen.getByRole('checkbox', { name: 'With Environment' }))

    const total = within(singlesFooter())
    expect(total.getByText(/All 3 packages, 25% off/)).toBeInTheDocument()
    expect(total.getByText('$39.00').tagName).toBe('S')
    expect(total.getByText('$29.00')).toBeInTheDocument()
    expect(allVariations()).toHaveClass('package-options__bundle--active')

    // Un-ticking one goes back to the plain sum.
    await user.click(screen.getByRole('checkbox', { name: 'GLB Only' }))
    expect(screen.getByText('2 packages: $30.00')).toBeInTheDocument()
  })

  it('adds All variations to the cart as one line once every package is ticked', async () => {
    const user = userEvent.setup()
    signIn()
    renderOptions({ product: product(), isFree: false })

    for (const name of ['With Light Rig', 'GLB Only', 'With Environment']) {
      await user.click(screen.getByRole('checkbox', { name }))
    }
    await user.click(screen.getByRole('button', { name: 'Add selected to cart' }))

    await vi.waitFor(() => expect(cartApi.addCartItem).toHaveBeenCalledTimes(1))
    expect(cartApi.addCartItem).toHaveBeenCalledWith({ product_type: 'product', product_id: PRODUCT_ID, package_kind: 'bundle', quantity: 1 })
  })

  it('buys All variations at once when every package is ticked', async () => {
    const user = userEvent.setup()
    signIn()
    vi.mocked(paymentsApi.createCheckoutSession).mockReturnValue(new Promise(() => {}))
    renderOptions({ product: product(), isFree: false })

    for (const name of ['With Light Rig', 'GLB Only', 'With Environment']) {
      await user.click(screen.getByRole('checkbox', { name }))
    }
    await user.click(within(singlesFooter()).getByRole('button', { name: 'Buy now' }))

    await vi.waitFor(() =>
      expect(paymentsApi.createCheckoutSession).toHaveBeenCalledWith(expect.anything(), [
        { product_type: 'product', product_id: PRODUCT_ID, package_kind: 'bundle' },
      ]),
    )
  })

  it('says All variations is in the cart rather than adding it twice', async () => {
    const user = userEvent.setup()
    signIn()
    vi.mocked(cartApi.getCart).mockResolvedValue(cart([
      { id: 'line', product_type: 'product', product_id: PRODUCT_ID, package_kind: 'bundle', quantity: 1, unit_price: '29.00', line_total: '29.00', catalog: null },
    ]))
    renderOptions({ product: product(), isFree: false })

    await screen.findByText('All variations')
    for (const name of ['With Light Rig', 'GLB Only', 'With Environment']) {
      await user.click(screen.getByRole('checkbox', { name }))
    }
    expect(await screen.findByRole('link', { name: 'All variations is in your cart' })).toHaveAttribute('href', '/cart')
    expect(screen.queryByRole('button', { name: 'Buy now' })).not.toBeInTheDocument()
  })

  it('charges the plain sum when the bundle is not offered, even with every package ticked', async () => {
    const user = userEvent.setup()
    signIn()
    renderOptions({ product: product(PACKAGES, NOT_OFFERED), isFree: false })

    for (const name of ['With Light Rig', 'GLB Only', 'With Environment']) {
      await user.click(screen.getByRole('checkbox', { name }))
    }
    expect(screen.getByText('3 packages: $39.00')).toBeInTheDocument()
  })

  it('adds one cart line per ticked package', async () => {
    const user = userEvent.setup()
    signIn()
    renderOptions({ product: product(), isFree: false })

    await user.click(screen.getByRole('checkbox', { name: 'GLB Only' }))
    await user.click(screen.getByRole('checkbox', { name: 'With Environment' }))
    await user.click(screen.getByRole('button', { name: 'Add selected to cart' }))

    await vi.waitFor(() => expect(cartApi.addCartItem).toHaveBeenCalledTimes(2))
    expect(cartApi.addCartItem).toHaveBeenCalledWith({ product_type: 'product', product_id: PRODUCT_ID, package_kind: 'glb_only', quantity: 1 })
    expect(cartApi.addCartItem).toHaveBeenCalledWith({ product_type: 'product', product_id: PRODUCT_ID, package_kind: 'environment', quantity: 1 })
  })

  it('buys the ticked packages at once', async () => {
    const user = userEvent.setup()
    signIn()
    vi.mocked(paymentsApi.createCheckoutSession).mockReturnValue(new Promise(() => {}))
    renderOptions({ product: product(), isFree: false })

    await user.click(screen.getByRole('checkbox', { name: 'GLB Only' }))
    await user.click(within(singlesFooter()).getByRole('button', { name: 'Buy now' }))

    await vi.waitFor(() =>
      expect(paymentsApi.createCheckoutSession).toHaveBeenCalledWith(expect.anything(), [
        { product_type: 'product', product_id: PRODUCT_ID, package_kind: 'glb_only' },
      ]),
    )
  })

  it('offers the download for an owned package and says when a package is in the cart', async () => {
    signIn()
    vi.mocked(downloadsApi.listDownloadEntitlements).mockResolvedValue([entitlement(['with_light_rig'])])
    vi.mocked(cartApi.getCart).mockResolvedValue(cart([
      { id: 'line', product_type: 'product', product_id: PRODUCT_ID, package_kind: 'glb_only', quantity: 1, unit_price: '9.00', line_total: '9.00', catalog: null },
    ]))
    vi.mocked(cartApi.getBundleQuote).mockResolvedValue({
      eligible: true, reason: '', kinds: ['glb_only', 'environment'], subtotal: '24.00', price: '18.00',
    })
    renderOptions({ product: product(), isFree: false })

    const download = await screen.findByRole('link', { name: 'Download' })
    expect(download).toHaveAttribute('href', '/dashboard/downloads')
    expect(await screen.findByRole('link', { name: 'In cart' })).toHaveAttribute('href', '/cart')
    expect(screen.queryByRole('checkbox', { name: 'With Light Rig' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'GLB Only' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'With Environment' })).toBeInTheDocument()
  })

  it('offers All variations for only the packages a buyer does not own, at their own price', async () => {
    signIn()
    vi.mocked(downloadsApi.listDownloadEntitlements).mockResolvedValue([entitlement(['with_light_rig'])])
    vi.mocked(cartApi.getBundleQuote).mockResolvedValue({
      eligible: true, reason: '', kinds: ['glb_only', 'environment'], subtotal: '24.00', price: '18.00',
    })
    renderOptions({ product: product(), isFree: false })

    expect(await screen.findByText('2 packages in one download (the whole zip), with 25% off the total.')).toBeInTheDocument()
    const offer = allVariations()
    expect(within(offer).getByText('$24.00').tagName).toBe('S')
    expect(within(offer).getByText('$18.00')).toBeInTheDocument()
    expect(cartApi.getBundleQuote).toHaveBeenCalledWith(PRODUCT_ID)
  })

  it('offers only downloads once the buyer owns every package', async () => {
    signIn()
    vi.mocked(downloadsApi.listDownloadEntitlements).mockResolvedValue([
      entitlement(['with_light_rig', 'without_light_rig', 'glb_only', 'environment']),
    ])
    renderOptions({ product: product(), isFree: false })

    expect(await screen.findByText('You own every package of this model.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Download' })).toHaveLength(3)
    expect(screen.queryByText('All variations')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buy now' })).not.toBeInTheDocument()
  })

  it('says a model with no priced package is not for sale', () => {
    renderOptions({ product: product([], NOT_OFFERED), isFree: false })
    expect(screen.getByText('This model is not for sale yet.')).toBeInTheDocument()
  })

  it('gives every package of a free model a direct download, with no cart or All variations', () => {
    const free = [pkg('glb_only', 'GLB Only', '0.00'), pkg('environment', 'With Environment', '0.00')]
    renderOptions({ product: product(free, NOT_OFFERED), isFree: true })

    const links = screen.getAllByRole('link', { name: 'Free download' })
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', expect.stringMatching(/\/api\/v1\/products\/oak-chair\/free-download\/\?package=glb_only$/))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText('All variations')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /buy now|sign in to buy/i })).not.toBeInTheDocument()
  })

  it('lists the one zip of a single-zip model at its price, with no All variations', async () => {
    const user = userEvent.setup()
    signIn()
    renderOptions({ product: product([pkg('whole', 'Whole File', '30.00')], NOT_OFFERED), isFree: false })

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('$30.00')).toBeInTheDocument()
    expect(screen.queryByText('All variations')).not.toBeInTheDocument()

    await user.click(await screen.findByRole('checkbox', { name: 'Whole File' }))
    expect(screen.getByText('1 package: $30.00')).toBeInTheDocument()
    await user.click(within(singlesFooter()).getByRole('button', { name: 'Add selected to cart' }))
    await vi.waitFor(() =>
      expect(cartApi.addCartItem).toHaveBeenCalledWith({ product_type: 'product', product_id: PRODUCT_ID, package_kind: 'whole', quantity: 1 }),
    )
  })

  it('offers the download once the buyer owns the one zip of a single-zip model', async () => {
    signIn()
    vi.mocked(downloadsApi.listDownloadEntitlements).mockResolvedValue([entitlement(['whole'])])
    renderOptions({ product: product([pkg('whole', 'Whole File', '30.00')], NOT_OFFERED), isFree: false })

    expect(await screen.findByText('You own every package of this model.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', '/dashboard/downloads')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
