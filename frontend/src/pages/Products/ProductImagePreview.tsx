interface ProductImagePreviewProps {
  src: string
  alt: string
  onError: () => void
}

export function ProductImagePreview({ src, alt, onError }: ProductImagePreviewProps) {
  return (
    <img
      src={src}
      alt={alt}
      decoding="async"
      fetchPriority="high"
      className="product-detail-stage__image"
      onError={onError}
    />
  )
}
