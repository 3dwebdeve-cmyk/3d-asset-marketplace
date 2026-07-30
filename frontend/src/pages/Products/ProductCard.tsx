import { useState } from 'react'
import { Link } from 'react-router-dom'

import { RatingDisplay } from '../../components/reviews/RatingDisplay'
import { WishlistToggle } from '../../components/wishlist/WishlistToggle'
import type { PublicProduct } from '../../types/product'

interface ProductCardProps {
  product: PublicProduct
}

export function ProductCard({ product }: ProductCardProps) {
  const [imgError, setImgError] = useState(false)

  const hasDiscount = Boolean(
    product.discount_price && Number(product.discount_price) < Number(product.price),
  )

  const formattedPrice = `$${Number(product.price).toFixed(2)}`
  const formattedDiscount = product.discount_price
    ? `$${Number(product.discount_price).toFixed(2)}`
    : null

  return (
    <article className="product-card">
      <div className="product-card__media">
        {product.thumbnail && !imgError ? (
          <img
            src={product.thumbnail}
            alt={product.name}
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

        {hasDiscount && <span className="product-card__badge-discount">Sale</span>}
        <span className="product-card__badge-license">{product.license_type}</span>
        <WishlistToggle
          productType="product"
          productId={product.id}
          productName={product.name}
          variant="icon"
        />
      </div>

      <div className="product-card__body">
        <div className="product-card__meta">
          <span className="product-card__category">{product.category.name}</span>
          <RatingDisplay
            averageRating={product.average_rating}
            reviewCount={product.review_count}
          />
        </div>

        <h3 className="product-card__title">
          <Link to={`/products/${product.slug}`} className="product-card__title-link">
            {product.name}
          </Link>
        </h3>

        {product.short_description ? (
          <p className="product-card__description">{product.short_description}</p>
        ) : null}

        <div className="product-card__footer">
          <div className="product-card__price-container">
            {hasDiscount ? (
              <>
                <span className="product-card__price product-card__price--discounted">
                  {formattedDiscount}
                </span>
                <span className="product-card__price product-card__price--original">
                  {formattedPrice}
                </span>
              </>
            ) : (
              <span className="product-card__price">{formattedPrice}</span>
            )}
            <span className="product-card__currency">{product.currency}</span>
          </div>

          <Link
            to={`/products/${product.slug}`}
            className="product-card__cta"
            aria-label={`View details for ${product.name}`}
          >
            View Details
          </Link>
        </div>
      </div>
    </article>
  )
}
