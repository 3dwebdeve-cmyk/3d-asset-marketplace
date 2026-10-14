import { useState } from 'react'
import { getCategoryIcon } from './categoryIcons'
import type { CategoryPublic } from '../types/category'

const LOCAL_CATEGORY_IMAGES: Record<string, string> = {
  furniture: '/homepage%20images/furniture.webp',
  products: '/homepage%20images/products.webp',
  toys: '/homepage%20images/toys.webp',
  electronics: '/homepage%20images/electronics.webp',
  'food-drink': '/homepage%20images/food.webp',
  character: '/homepage%20images/character.webp',
  industrial: '/homepage%20images/industrial.webp',
  household: '/homepage%20images/aaa/household.png',
  'plants-vegetation': '/homepage%20images/aaa/plants.png',
  lights: '/homepage%20images/aaa/lights.png',
  '3d-printing': '/homepage%20images/printing.webp',
  'assets-props': '/homepage%20images/props.webp',
  'lifestyle-visualisation': '/homepage%20images/aaa/lifestyle.png',
  'cloth-items': '/homepage%20images/aaa/cloth.png',
  'interactive-webar': '/homepage%20images/webar.webp',
  'architectural-3d-models': '/homepage%20images/architecture.webp',
  'interior-3d-models': '/homepage%20images/interior.webp',
}

export function CategoryTile({
  category,
  onSelect,
}: {
  category: CategoryPublic
  onSelect: () => void
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const slug = category.slug.trim().toLowerCase()
  const Icon = getCategoryIcon(slug)
  const imageSrc = LOCAL_CATEGORY_IMAGES[slug] ?? category.image

  return (
    <button
      type="button"
      className={`browse-category-card browse-category-card--${slug}`}
      onClick={onSelect}
      aria-label={`Browse ${category.name} 3D models`}
    >
      <div className="browse-category-card__media">
        {imageSrc && failedImage !== imageSrc ? (
          <img
            src={imageSrc}
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
    </button>
  )
}
