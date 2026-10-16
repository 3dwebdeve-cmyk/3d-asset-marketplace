import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getCategoryIcon } from './categoryIcons'
import { categoryPath } from '../lib/categorySeo'
import type { CategoryPublic } from '../types/category'

const LOCAL_CATEGORY_IMAGES: Record<string, string> = {
  furniture: '/catego%20image/Luxurious%20Chaise%20Lounge%20Overlooking%20City%20Lights.png',
  products: '/catego%20image/Premium%20Olive%20Gear%20Still%20Life.png',
  toys: '/catego%20image/Colorful%20Toy%20Tabletop%20with%20Teddy%20Bear.png?v=2',
  electronics: '/catego%20image/Premium%20Tech%20Gear%20Flat%20Lay.png',
  'food-drink': '/catego%20image/Cinematic%20Red%20Tray%20Burger%20Feast.png',
  character: '/catego%20image/Spiked%20Ogre%20Warrior%20with%20Stone%20Mace.png',
  industrial: '/catego%20image/Industrial%20Yellow%20Engine%20Assembly.png',
  household: '/homepage%20images/aaa/household.png',
  'plants-vegetation': '/catego%20image/Sunlit%20Botanical%20Still%20Life%20with%20Ceramic%20Planters.png',
  lights: '/catego%20image/Rustic%20Rope-Wrapped%20Pendant%20Chandelier.png',
  '3d-printing': '/catego%20image/Vibrant%203D%20Printing%20Workshop%20Bench.png',
  'assets-props': '/catego%20image/Sunlit%20Antique%20Trunk%20in%20a%20Cozy%20Study.png',
  'lifestyle-visualisation': '/catego%20image/Warm%20Modern%20Living%20Room%20and%20Kitchen.png',
  'cloth-items': '/catego%20image/Autumn%20Heritage%20Menswear%20Flat%20Lay.png',
  'interactive-webar': '/catego%20image/Augmented%20Reality%20Living%20Room%20Design.png',
  'architectural-3d-models': '/catego%20image/Illuminated%20Architectural%20House%20Model.png',
  'interior-3d-models': '/catego%20image/Golden%20Moon%20Clock%20Living%20Room.png',
}

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
  const imageSrc = LOCAL_CATEGORY_IMAGES[slug] ?? category.image

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
    </Link>
  )
}
