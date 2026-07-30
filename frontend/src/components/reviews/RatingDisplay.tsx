interface RatingDisplayProps {
  averageRating: string | number
  reviewCount?: number
  variant?: 'card' | 'detail'
  className?: string
}

export function RatingDisplay({
  averageRating,
  reviewCount = 0,
  variant = 'card',
  className,
}: RatingDisplayProps) {
  const rating = Number(averageRating)
  const hasRating = !Number.isNaN(rating) && rating > 0
  const countLabel = reviewCount > 0 ? ` (${reviewCount.toLocaleString()})` : ''

  if (variant === 'detail') {
    return (
      <span className={className ?? 'product-detail-purchase__rating'}>
        {hasRating ? `${rating.toFixed(1)} rating${countLabel}` : 'New'}
      </span>
    )
  }

  return (
    <span className={className ?? 'product-card__rating'}>
      ⭐ {hasRating ? `${rating.toFixed(1)}${countLabel}` : 'New'}
    </span>
  )
}
