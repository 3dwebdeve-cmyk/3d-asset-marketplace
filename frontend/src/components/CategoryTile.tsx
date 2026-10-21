import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getCategoryIcon } from './categoryIcons'
import { categoryPath } from '../lib/categorySeo'
import { LOCAL_CATEGORY_IMAGES, responsiveImageProps } from './categoryImages'
import type { CategoryPublic } from '../types/category'

/**
 * A real link to the category's own address (for example /3d-models/furniture), so search
 * engines can follow it, and visitors can open it in a new tab or share it.
 */
export function CategoryTile({
  category,
  onSelect,
}: {
  category: CategoryPublic
  /** Optional hook for analytics; navigation itself is the link. */
  onSelect?: () => void
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const slug = category.slug.trim().toLowerCase()
  const Icon = getCategoryIcon(slug)
  const localImage = LOCAL_CATEGORY_IMAGES[slug]
  const imageSrc = localImage ?? category.image

  return (
    <Link
      to={categoryPath(slug)}
      className={`browse-category-card browse-category-card--${slug}`}
      onClick={onSelect}
      aria-label={`Browse ${category.name} 3D models`}
    >
      <div className="browse-category-card__media">
        {imageSrc && failedImage !== imageSrc ? (
          <img
            {...responsiveImageProps(imageSrc, Boolean(localImage))}
            width={1000}
            height={566}
            alt=""
            className="browse-category-card__image"
            onError={() => setFailedImage(imageSrc)}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="browse-category-card__placeholder" aria-hidden="true" />
        )}
        <div className="browse-category-card__overlay" aria-hidden="true" />
      </div>
      <div className="browse-category-card__content">
        <div className="browse-category-card__icon-badge" aria-hidden="true">
          <Icon className="browse-category-card__icon" />
        </div>
        <span className="browse-category-card__name">{category.name}</span>
      </div>
    </Link>
  )
}
