import { useState } from 'react'
import { Link } from 'react-router-dom'

import { WishlistToggle } from '../../components/wishlist/WishlistToggle'
import type { PublicProduct } from '../../types/product'

interface ProductCardProps {
  product: PublicProduct
}

function formatCompactCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(value)
}

function formatRatingDisplay(averageRating: string): string {
  const rating = Number(averageRating)
  if (!Number.isFinite(rating) || rating <= 0) {
    return '0'
  }
  return rating % 1 === 0 ? String(rating) : rating.toFixed(1)
}

export function ProductCard({ product }: ProductCardProps) {
  const [imgError, setImgError] = useState(false)

  const hasDiscount = Boolean(
    product.discount_price && Number(product.discount_price) < Number(product.price),
  )

  const displayPrice = hasDiscount
    ? Number(product.discount_price)
    : Number(product.price)
  const formattedPrice = `$ ${displayPrice.toFixed(2)}`
  const formattedOriginal = `$ ${Number(product.price).toFixed(2)}`

  const detailPath = `/products/${product.slug}`

  return (
    <article className="product-card product-card--marketplace">
      <div className="product-card__media">
        <Link to={detailPath} className="product-card__media-link" tabIndex={-1}>
          {product.thumbnail && !imgError ? (
            <img
              src={product.thumbnail}
              alt=""
              className="product-card__image"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="product-card__image-placeholder" aria-hidden="true">
              <svg
                className="product-card__placeholder-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              <span className="product-card__placeholder-text">3D Asset</span>
            </div>
          )}
        </Link>

        {hasDiscount ? <span className="product-card__badge-discount">Sale</span> : null}

        <Link
          to={detailPath}
          className="product-card__overlay-btn product-card__overlay-btn--download"
          aria-label={`View or download ${product.name}`}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 3v12" strokeLinecap="round" />
            <path d="M7 11l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 19h14" strokeLinecap="round" />
          </svg>
        </Link>

        <WishlistToggle
          productType="product"
          productId={product.id}
          productName={product.name}
          variant="icon"
          className="product-card__overlay-btn product-card__overlay-btn--wishlist"
        />
      </div>

      <div className="product-card__body">
        <h3 className="product-card__title">
          <Link to={detailPath} className="product-card__title-link">
            {product.name}
          </Link>
        </h3>

        <div className="product-card__footer">
          <ul className="product-card__stats" aria-label="Product stats">
            <li className="product-card__stat" title="Downloads">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>{formatCompactCount(product.total_downloads)}</span>
            </li>
            <li className="product-card__stat" title="Reviews">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>{formatCompactCount(product.review_count)}</span>
            </li>
            <li className="product-card__stat" title="Rating">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2l2.9 6.3L22 9.3l-5 4.8 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.8 7.1-1z" />
              </svg>
              <span>{formatRatingDisplay(product.average_rating)}</span>
            </li>
          </ul>

          <div className="product-card__price-container">
            {hasDiscount ? (
              <>
                <span className="product-card__price">{formattedPrice}</span>
                <span className="product-card__price product-card__price--original">
                  {formattedOriginal}
                </span>
              </>
            ) : (
              <span className="product-card__price">{formattedPrice}</span>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
