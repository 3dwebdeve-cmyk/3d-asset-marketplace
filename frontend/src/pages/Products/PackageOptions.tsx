import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { getBundleQuote } from '../../api/cartApi'
import { freeDownloadUrl } from '../../api/productsApi'
import { AuthEntryButton } from '../../components/auth/AuthEntryButton'
import { useWithdrawalWaiver } from '../../components/commerce/WithdrawalWaiver'
import { Button } from '../../components/ui/Button'
import { useBuyNow } from '../../hooks/useBuyNow'
import { useCart } from '../../hooks/useCart'
import { useOwnedItems } from '../../hooks/useOwnedItems'
import { formatFileSize, formatMoney } from '../../lib/format'
import type { LineKind, PackageKind } from '../../lib/packages'
import { formatSaleEnd } from '../../lib/pricing'
import type { BundleOffer, PublicProductDetail, PublicProductPackage } from '../../types/product'

interface PackageOptionsProps {
  product: Pick<PublicProductDetail, 'id' | 'slug' | 'name' | 'currency' | 'packages' | 'bundle'>
  /** A free model: every package is a free download, with no cart or checkout. */
  isFree: boolean
}

const ALL_VARIATIONS: LineKind = 'bundle'

/** "3 downloads left" under an owned package's Download button. */
function DownloadsLeftNote({ left }: { left: number | null }) {
  if (left === null) return null
  return (
    <span className="package-options__downloads-left">
      {left} {left === 1 ? 'download' : 'downloads'} left
    </span>
  )
}

function PackagePrice({ item, currency }: { item: PublicProductPackage; currency: string }) {
  if (item.discount_price) {
    return (
      <span className="package-options__price">
        <span className="package-options__price-current">{formatMoney(item.discount_price, currency)}</span>{' '}
        <s className="package-options__price-original">{formatMoney(item.price, currency)}</s>
        {item.sale_ends_at ? (
          <span className="package-options__sale-ends">Until {formatSaleEnd(item.sale_ends_at)}</span>
        ) : null}
      </span>
    )
  }
  return <span className="package-options__price-current">{formatMoney(item.price, currency)}</span>
}

/**
 * The model's packages on its page: one row each with its contents, size and price. A buyer
 * ticks the packages they want, then adds them to the cart or buys them at once. When every
 * variation is offered, All variations is one more choice: every package in one download at
 * 25% off. Owned packages offer the download; packages in the cart say so.
 */
export function PackageOptions({ product, isFree }: PackageOptionsProps) {
  const location = useLocation()
  const { isSignedIn, isInCart, addPackages, isPending } = useCart()
  const { ownedPackages, ownedLoaded, downloadsLeft } = useOwnedItems()
  const { buyNow, isRedirecting } = useBuyNow()
  const waiver = useWithdrawalWaiver()
  const [ticked, setTicked] = useState<ReadonlySet<PackageKind>>(() => new Set())

  const owned = isSignedIn ? ownedPackages(product.id) : new Set<PackageKind>()
  const ownsEverything = product.packages.length > 0 && product.packages.every((item) => owned.has(item.kind))
  const inCart = (kind: LineKind) => isSignedIn && isInCart('product', product.id, kind)
  const buyable = (kind: PackageKind) => !owned.has(kind) && !inCart(kind)
  const selected = product.packages.filter((item) => ticked.has(item.kind) && buyable(item.kind))
  const total = selected.reduce((sum, item) => sum + Number(item.effective_price), 0)
  const busy = isPending || isRedirecting

  // A buyer who owns some packages is offered only the rest: ask the server for that price.
  const ownsSome = isSignedIn && owned.size > 0
  const restOffer = useQuery({
    queryKey: ['bundle-quote', product.id],
    queryFn: () => getBundleQuote(product.id),
    enabled: ownsSome && !isFree && !ownsEverything,
  })
  // Until the buyer's library has loaded, the offer is not known: show none rather than the wrong price.
  const offer: BundleOffer | undefined = !ownedLoaded ? undefined : ownsSome ? restOffer.data : product.bundle

  if (product.packages.length === 0) {
    return <p className="package-options__empty">This model is not for sale yet.</p>
  }

  const toggle = (kind: PackageKind) =>
    setTicked((current) => {
      const next = new Set(current)
      if (!next.delete(kind)) next.add(kind)
      return next
    })

  const selectedKinds = selected.map((item) => item.kind)
  const allVariationsInCart = inCart(ALL_VARIATIONS)
  const showAllVariations = !isFree && !ownsEverything && offer?.eligible === true
  // Every package the bundle covers is ticked: the buyer pays the All variations price, not the sum.
  const allTicked =
    showAllVariations &&
    offer !== undefined &&
    offer.kinds.length > 0 &&
    selectedKinds.length === offer.kinds.length &&
    offer.kinds.every((kind) => selectedKinds.includes(kind))
  const payAsBundle = allTicked && offer !== undefined
  const bundleAlreadyInCart = payAsBundle && allVariationsInCart
  const payKinds: LineKind[] = payAsBundle ? [ALL_VARIATIONS] : selectedKinds
  const hasSelection = selected.length > 0

  return (
    <section className="package-options" aria-labelledby={`package-options-${product.id}`}>
      <h2 id={`package-options-${product.id}`} className="package-options__title">
        {isFree ? 'Free downloads' : 'Choose your packages'}
      </h2>
      <ul className="package-options__list">
        {product.packages.map((item) => {
          const id = `package-${product.id}-${item.kind}`
          const isOwned = owned.has(item.kind)
          const isInCartNow = !isOwned && inCart(item.kind)
          return (
            <li key={item.kind} className="package-options__row">
              <div className="package-options__main">
                {!isFree && buyable(item.kind) ? (
                  <input
                    id={id}
                    type="checkbox"
                    className="package-options__check"
                    checked={ticked.has(item.kind)}
                    onChange={() => toggle(item.kind)}
                    disabled={busy}
                  />
                ) : null}
                <div className="package-options__text">
                  {!isFree && buyable(item.kind) ? (
                    <label htmlFor={id} className="package-options__label">{item.label}</label>
                  ) : (
                    <span className="package-options__label">{item.label}</span>
                  )}
                  <p className="package-options__description">{item.description}</p>
                </div>
              </div>
              <div className="package-options__side">
                <span className="package-options__size">{formatFileSize(item.file_size)}</span>
                {isFree ? (
                  <a className="ui-button ui-button--primary package-options__action" href={freeDownloadUrl(product.slug, item.kind)}>
                    Free download
                  </a>
                ) : isOwned ? (
                  <>
                    <Link className="ui-button ui-button--secondary package-options__action" to="/dashboard/downloads">
                      Download
                    </Link>
                    <DownloadsLeftNote left={downloadsLeft('product', product.id, item.kind)} />
                  </>
                ) : (
                  <>
                    <PackagePrice item={item} currency={product.currency} />
                    {isInCartNow ? (
                      <Link className="package-options__in-cart" to="/cart">In cart</Link>
                    ) : null}
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {showAllVariations && offer ? (
        <div className={`package-options__bundle${payAsBundle ? ' package-options__bundle--active' : ''}`}>
          <h3 className="package-options__bundle-title">All variations</h3>
          <p className="package-options__bundle-description">
            {offer.kinds.length} packages in one download (the whole zip), with 25% off the total.
          </p>
          <p className="package-options__bundle-price">
            <s className="package-options__price-original">{formatMoney(offer.subtotal, product.currency)}</s>{' '}
            <span className="package-options__price-current">{formatMoney(offer.price, product.currency)}</span>
          </p>
        </div>
      ) : null}

      {isFree ? null : ownsEverything ? (
        <p className="package-options__owned">You own every package of this model.</p>
      ) : (
        <div className="package-options__footer">
          <p className="package-options__total" aria-live="polite">
            {!hasSelection ? (
              'Tick the packages you want.'
            ) : payAsBundle && offer ? (
              <>
                All {offer.kinds.length} packages, 25% off:{' '}
                <s className="package-options__price-original">{formatMoney(offer.subtotal, product.currency)}</s>{' '}
                <span className="package-options__total-pay">{formatMoney(offer.price, product.currency)}</span>
              </>
            ) : (
              `${selected.length} package${selected.length === 1 ? '' : 's'}: ${formatMoney(total.toFixed(2), product.currency)}`
            )}
          </p>
          {!hasSelection ? null : isSignedIn ? (
            bundleAlreadyInCart ? (
              <Link className="package-options__in-cart" to="/cart">All variations is in your cart</Link>
            ) : (
              <>
                {waiver.field}
                <div className="package-options__actions">
                  <Button
                    type="button"
                    isLoading={isRedirecting}
                    disabled={busy}
                    onClick={() => {
                      if (waiver.confirm()) buyNow('product', product.id, payKinds)
                    }}
                  >
                    Buy now
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    isLoading={isPending}
                    disabled={busy}
                    onClick={() => {
                      addPackages(product.id, payKinds)
                      setTicked(new Set())
                    }}
                  >
                    Add selected to cart
                  </Button>
                </div>
              </>
            )
          ) : (
            <AuthEntryButton
              mode="login"
              returnTo={location.pathname}
              className="ui-button ui-button--primary package-options__sign-in"
            >
              Sign in to buy
            </AuthEntryButton>
          )}
        </div>
      )}
    </section>
  )
}
