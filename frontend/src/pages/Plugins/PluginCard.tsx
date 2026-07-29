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

  const formattedPrice = `$${Number(plugin.price).toFixed(2)}`
  const formattedDiscount = plugin.discount_price
    ? `$${Number(plugin.discount_price).toFixed(2)}`
    : null

  const rating = Number(plugin.average_rating)

  return (
    <article className="product-card">
      <div className="product-card__media">
        {plugin.thumbnail && !imgError ? (
          <img
            src={plugin.thumbnail}
            alt={plugin.name}
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
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <span className="product-card__placeholder-text">Plugin</span>
          </div>
        )}

        {hasDiscount && <span className="product-card__badge-discount">Sale</span>}
        <span className="product-card__badge-license">{plugin.license_type}</span>
      </div>

      <div className="product-card__body">
        <div className="product-card__meta">
          <span className="product-card__category">{plugin.category.name}</span>
          <span className="product-card__rating">
            ⭐ {rating > 0 ? rating.toFixed(1) : 'New'}
          </span>
        </div>

        <h3 className="product-card__title">
          <Link to={`/plugins/${plugin.slug}`} className="product-card__title-link">
            {plugin.name}
          </Link>
        </h3>

        {plugin.short_description ? (
          <p className="product-card__description">{plugin.short_description}</p>
        ) : null}

        {plugin.compatibility ? (
          <p className="product-card__description product-card__compat">
            Works with: {plugin.compatibility}
          </p>
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
            <span className="product-card__currency">{plugin.currency}</span>
          </div>

          <Link
            to={`/plugins/${plugin.slug}`}
            className="product-card__cta"
            aria-label={`View details for ${plugin.name}`}
          >
            View Details
          </Link>
        </div>
      </div>
    </article>
  )
}
