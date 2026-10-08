import { useState } from 'react'
import { Link } from 'react-router-dom'

import { WishlistToggle } from '../../components/wishlist/WishlistToggle'
import type { PublicProduct } from '../../types/product'

interface ProductCardProps {
  product: PublicProduct
}

function formatCardPrice(amount: number): string {
  return `$ ${amount.toFixed(2)}`
}

export function ProductCard({ product }: ProductCardProps) {
  const [imgError, setImgError] = useState(false)

  const hasDiscount = Boolean(
    product.discount_price && Number(product.discount_price) < Number(product.price),
  )

  const displayPrice = hasDiscount
    ? Number(product.discount_price)
    : Number(product.price)
  const formattedPrice = formatCardPrice(displayPrice)
  const formattedOriginal = formatCardPrice(Number(product.price))
  const categoryLabel = product.category?.name?.trim() ?? ''
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
              decoding="async"
            />
          ) : (
            <div className="product-card__image-placeholder" aria-hidden="true">
              <svg
                className="product-card__placeholder-icon"
                viewBox="0 0 24 24"
                width="44"
                height="44"
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

        <WishlistToggle
          productType="product"
          productId={product.id}
          productName={product.name}
          variant="icon"
        />

        {categoryLabel ? (
          <span className="product-card__badge-category">{categoryLabel}</span>
        ) : null}

        {hasDiscount ? <span className="product-card__badge-discount">Sale</span> : null}
      </div>

      <div className="product-card__body">
        <h3 className="product-card__title">
          <Link to={detailPath} className="product-card__title-link">
            {product.name}
          </Link>
        </h3>

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
    </article>
  )
}
