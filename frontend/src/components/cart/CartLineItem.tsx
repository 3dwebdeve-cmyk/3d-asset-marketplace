import { Link } from 'react-router-dom'

import type { CartItem } from '../../types/cart'
import { formatMoney } from '../../lib/format'

const MAX_QUANTITY = 99

function getDetailPath(item: CartItem): string | null {
  if (!item.catalog?.slug) {
    return null
  }
  return item.product_type === 'product'
    ? `/products/${item.catalog.slug}`
    : `/plugins/${item.catalog.slug}`
}

function getCategoryLabel(item: CartItem): string {
  if (item.catalog?.category?.name) {
    return item.catalog.category.name
  }
  return item.product_type === 'product' ? '3D Models' : 'Plugins'
}

function getOptionLabel(item: CartItem): string {
  return item.product_type === 'product' ? 'Standard license' : 'Plugin license'
}

function getOptionDescription(item: CartItem): string {
  return item.product_type === 'product'
    ? 'Instant download with commercial license'
    : 'Instant download for compatible software'
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
  const categoryLabel = getCategoryLabel(item)
  const optionLabel = getOptionLabel(item)
  const optionDescription = getOptionDescription(item)
  const isAvailable = catalog?.is_available ?? false
  const itemCurrency = catalog?.currency ?? currency
  const displayName = catalog?.name ?? 'Unavailable item'
  const unitPrice = item.unit_price ?? catalog?.effective_price ?? '0.00'

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
            {categoryLabel}
          </div>
        )}
      </div>

      <div className="cart-line-item__body">
        <div className="cart-line-item__top">
          <h3 className="cart-line-item__title">
            {detailPath ? (
              <Link to={detailPath} className="cart-line-item__title-link">
                {displayName}
              </Link>
            ) : (
              <span>{displayName}</span>
            )}
          </h3>
          <p className="cart-line-item__price">{formatMoney(unitPrice, itemCurrency)}</p>
        </div>

        <p className="cart-line-item__category">
          {categoryLabel}
          {!isAvailable ? (
            <span className="cart-line-item__unavailable-badge">Unavailable</span>
          ) : null}
        </p>

        <p className="cart-line-item__option">
          <span>{optionLabel}</span>
          <span className="cart-line-item__option-chevron" aria-hidden="true">
            ▾
          </span>
        </p>
        <p className="cart-line-item__option-hint">{optionDescription}</p>

        <div className="cart-line-item__footer">
          <div
            className="cart-quantity-stepper"
            aria-label={`Quantity for ${displayName}`}
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

          <button
            type="button"
            className="cart-line-item__remove"
            disabled={isUpdating || isRemoving}
            aria-busy={isRemoving}
            onClick={() => onRemove(item.id)}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="cart-line-item__remove-icon"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7h16" />
              <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              <path d="M7 7l1 13h8l1-13" />
              <path d="M10 11v6M14 11v6" />
            </svg>
            {isRemoving ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </article>
  )
}

export function formatCartPrice(amount: string, currency: string): string {
  return formatMoney(amount, currency)
}
