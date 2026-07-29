import { Link } from 'react-router-dom'

import { Button } from '../ui/Button'
import type { CartItem } from '../../types/cart'

const MAX_QUANTITY = 99

function formatPrice(amount: string | null, currency: string): string {
  if (!amount) {
    return '—'
  }
  const value = Number(amount)
  if (Number.isNaN(value)) {
    return `${currency} ${amount}`
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(value)
  } catch {
    return `${currency} ${amount}`
  }
}

function getDetailPath(item: CartItem): string | null {
  if (!item.catalog?.slug) {
    return null
  }
  return item.product_type === 'product'
    ? `/products/${item.catalog.slug}`
    : `/plugins/${item.catalog.slug}`
}

interface CartLineItemProps {
  item: CartItem
  currency: string
  isUpdating: boolean
  isRemoving: boolean
  onUpdateQuantity: (itemId: string, quantity: number) => void
  onRemove: (itemId: string) => void
  compact?: boolean
}

export function CartLineItem({
  item,
  currency,
  isUpdating,
  isRemoving,
  onUpdateQuantity,
  onRemove,
  compact = false,
}: CartLineItemProps) {
  const catalog = item.catalog
  const detailPath = getDetailPath(item)
  const typeLabel = item.product_type === 'product' ? 'Product' : 'Plugin'
  const isAvailable = catalog?.is_available ?? false
  const itemCurrency = catalog?.currency ?? currency

  const handleDecrease = () => {
    if (item.quantity <= 1) {
      onRemove(item.id)
      return
    }
    onUpdateQuantity(item.id, item.quantity - 1)
  }

  const handleIncrease = () => {
    if (item.quantity >= MAX_QUANTITY) {
      return
    }
    onUpdateQuantity(item.id, item.quantity + 1)
  }

  return (
    <article
      className={`cart-line-item ${compact ? 'cart-line-item--compact' : ''} ${!isAvailable ? 'cart-line-item--unavailable' : ''}`}
    >
      <div className="cart-line-item__media">
        {catalog?.thumbnail ? (
          <img
            src={catalog.thumbnail}
            alt={catalog.name}
            className="cart-line-item__image"
            loading="lazy"
          />
        ) : (
          <div className="cart-line-item__image-placeholder" aria-hidden="true">
            {typeLabel}
          </div>
        )}
      </div>

      <div className="cart-line-item__body">
        <div className="cart-line-item__header">
          <span className="cart-line-item__type">{typeLabel}</span>
          {!isAvailable ? (
            <span className="cart-line-item__unavailable-badge">Unavailable</span>
          ) : null}
        </div>

        <h3 className="cart-line-item__title">
          {detailPath ? (
            <Link to={detailPath} className="cart-line-item__title-link">
              {catalog?.name ?? 'Unavailable item'}
            </Link>
          ) : (
            <span>{catalog?.name ?? 'Unavailable item'}</span>
          )}
        </h3>

        <p className="cart-line-item__price">
          {formatPrice(item.unit_price, itemCurrency)} each
        </p>

        <div className="cart-line-item__footer">
          <div
            className="cart-quantity-stepper"
            aria-label={`Quantity for ${catalog?.name ?? 'item'}`}
          >
            <button
              type="button"
              className="cart-quantity-stepper__button"
              aria-label="Decrease quantity"
              disabled={!isAvailable || isUpdating || isRemoving}
              onClick={handleDecrease}
            >
              −
            </button>
            <span className="cart-quantity-stepper__value" aria-live="polite">
              {item.quantity}
            </span>
            <button
              type="button"
              className="cart-quantity-stepper__button"
              aria-label="Increase quantity"
              disabled={!isAvailable || isUpdating || isRemoving || item.quantity >= MAX_QUANTITY}
              onClick={handleIncrease}
            >
              +
            </button>
          </div>

          <p className="cart-line-item__line-total">
            {formatPrice(item.line_total, itemCurrency)}
          </p>

          <Button
            type="button"
            variant="secondary"
            className="cart-line-item__remove"
            isLoading={isRemoving}
            disabled={isUpdating}
            onClick={() => onRemove(item.id)}
          >
            Remove
          </Button>
        </div>
      </div>
    </article>
  )
}

export function formatCartPrice(amount: string, currency: string): string {
  return formatPrice(amount, currency)
}
