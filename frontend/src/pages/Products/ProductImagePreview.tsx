interface ProductImagePreviewProps {
  src: string
  alt: string
  edgeColors?: { left: string; right: string } | null
  onError: () => void
}

export function ProductImagePreview({ src, alt, edgeColors, onError }: ProductImagePreviewProps) {
  const hexColor = /^#[0-9a-f]{6}$/i
  const backgroundImage = edgeColors && hexColor.test(edgeColors.left) && hexColor.test(edgeColors.right)
    ? `linear-gradient(to right, ${edgeColors.left}, ${edgeColors.right})`
    : undefined

  return (
    <img
      src={src}
      alt={alt}
      decoding="async"
      fetchPriority="high"
      className="product-detail-stage__image"
      style={backgroundImage ? { backgroundImage } : undefined}
      onError={onError}
    />
  )
}
