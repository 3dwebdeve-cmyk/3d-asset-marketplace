import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { PublicPlugin } from '../../types/plugin'

interface PluginCardProps {
  plugin: PublicPlugin
}

export function PluginCard({ plugin }: PluginCardProps) {
  const [imgError, setImgError] = useState(false)

  const hasDiscount = Boolean(
    plugin.discount_price && Number(plugin.discount_price) < Number(plugin.price),
  )

  const displayPrice = hasDiscount
    ? Number(plugin.discount_price)
    : Number(plugin.price)
  const formattedPrice = `$${displayPrice.toFixed(2)}`
  const formattedOriginal = `$${Number(plugin.price).toFixed(2)}`
  const categoryLabel = plugin.category?.name?.trim() ?? ''
  const detailPath = `/plugins/${plugin.slug}`

  return (
    <article className="product-card product-card--marketplace">
      <div className="product-card__media">
        <Link to={detailPath} className="product-card__media-link" tabIndex={-1}>
          {plugin.thumbnail && !imgError ? (
            <img
              src={plugin.thumbnail}
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
                width="44"
                height="44"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              <span className="product-card__placeholder-text">Plugin</span>
            </div>
          )}
        </Link>

        {categoryLabel ? (
          <span className="product-card__badge-category">{categoryLabel}</span>
        ) : null}

        {hasDiscount ? <span className="product-card__badge-discount">Sale</span> : null}
      </div>

      <div className="product-card__body">
        <h3 className="product-card__title">
          <Link to={detailPath} className="product-card__title-link">
            {plugin.name}
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
