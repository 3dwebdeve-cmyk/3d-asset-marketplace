import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { freeDownloadUrl } from '../../api/productsApi'
import { AuthEntryButton } from '../../components/auth/AuthEntryButton'
import { Button } from '../../components/ui/Button'
import { useBuyNow } from '../../hooks/useBuyNow'
import { useCart } from '../../hooks/useCart'
import { useOwnedItems } from '../../hooks/useOwnedItems'
import { formatFileSize, formatMoney } from '../../lib/format'
import type { PackageKind } from '../../lib/packages'
import { formatSaleEnd } from '../../lib/pricing'
import type { PublicProductDetail, PublicProductPackage } from '../../types/product'

interface PackageOptionsProps {
  product: Pick<PublicProductDetail, 'id' | 'slug' | 'name' | 'currency' | 'packages' | 'bundle_saving'>
  /** A free model: every package is a free download, with no cart or checkout. */
  isFree: boolean
}

/** "Everything in one download – save $X (Y%)" for Whole File, or '' when it saves nothing. */
function wholeFileSaving(whole: PublicProductPackage, saving: string | null, currency: string): string {
  const amount = Number(saving)
  if (!saving || !(amount > 0)) return ''
  const apart = Number(whole.effective_price) + amount
  const percent = Math.round((amount / apart) * 100)
  return `Everything in one download – save ${formatMoney(saving, currency)} (${percent}%)`
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
 * ticks the packages they want, then adds them to the cart or buys them at once. Owned
 * packages offer the download (Whole File owns them all); packages in the cart say so.
 */
export function PackageOptions({ product, isFree }: PackageOptionsProps) {
  const location = useLocation()
  const { isSignedIn, isInCart, addPackages, isPending } = useCart()
  const { ownedPackages } = useOwnedItems()
  const { buyNow, isRedirecting } = useBuyNow()
  const [ticked, setTicked] = useState<ReadonlySet<PackageKind>>(() => new Set())

  const owned = isSignedIn ? ownedPackages(product.id) : new Set<PackageKind>()
  const ownsEverything = owned.has('whole')
  const inCart = (kind: PackageKind) => isSignedIn && isInCart('product', product.id, kind)
  const buyable = (kind: PackageKind) => !owned.has(kind) && !inCart(kind)
  const selected = product.packages.filter((item) => ticked.has(item.kind) && buyable(item.kind))
  const total = selected.reduce((sum, item) => sum + Number(item.effective_price), 0)
  const busy = isPending || isRedirecting

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

  return (
    <section className="package-options" aria-labelledby={`package-options-${product.id}`}>
      <h2 id={`package-options-${product.id}`} className="package-options__title">
        {isFree ? 'Free downloads' : 'Choose your packages'}
      </h2>
      <ul className="package-options__list">
        {product.packages.map((item) => {
          const id = `package-${product.id}-${item.kind}`
          const saving = item.kind === 'whole' ? wholeFileSaving(item, product.bundle_saving, product.currency) : ''
          const isOwned = owned.has(item.kind)
          const isInCartNow = !isOwned && inCart(item.kind)
          return (
            <li
              key={item.kind}
              className={`package-options__row${item.kind === 'whole' ? ' package-options__row--whole' : ''}`}
            >
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
                  {saving ? <p className="package-options__saving">{saving}</p> : null}
                </div>
              </div>
              <div className="package-options__side">
                <span className="package-options__size">{formatFileSize(item.file_size)}</span>
                {isFree ? (
                  <a className="ui-button ui-button--primary package-options__action" href={freeDownloadUrl(product.slug, item.kind)}>
                    Free download
                  </a>
                ) : isOwned ? (
                  <Link className="ui-button ui-button--secondary package-options__action" to="/dashboard/downloads">
                    Download
                  </Link>
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

      {isFree ? null : ownsEverything ? (
        <p className="package-options__owned">You own every package of this model.</p>
      ) : (
        <div className="package-options__footer">
          <p className="package-options__total" aria-live="polite">
            {selected.length === 0
              ? 'Tick the packages you want.'
              : `${selected.length} package${selected.length === 1 ? '' : 's'}: ${formatMoney(total.toFixed(2), product.currency)}`}
          </p>
          {isSignedIn ? (
            <div className="package-options__actions">
              <Button
                type="button"
                isLoading={isRedirecting}
                disabled={selected.length === 0 || busy}
                onClick={() => buyNow('product', product.id, selectedKinds)}
              >
                Buy now
              </Button>
              <Button
                type="button"
                variant="secondary"
                isLoading={isPending}
                disabled={selected.length === 0 || busy}
                onClick={() => {
                  addPackages(product.id, selectedKinds)
                  setTicked(new Set())
                }}
              >
                Add selected to cart
              </Button>
            </div>
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
