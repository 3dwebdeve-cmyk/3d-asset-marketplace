import type { PublicProductDetail } from '../../types/product'

interface ProductSpecsProps {
  product: PublicProductDetail
}

function formatCount(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '—'
  }
  return value.toLocaleString()
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No'
}

function SpecIcon({ name }: { name: string }) {
  if (name === 'Polygons') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#06b6d4" strokeWidth="1.8" aria-hidden="true">
        <path d="M12 2l8.5 4.9v9.8L12 21.6l-8.5-4.9V6.9L12 2z" />
      </svg>
    )
  }
  if (name === 'Vertices') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#06b6d4" strokeWidth="1.8" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M7 8l5 8 5-8" />
      </svg>
    )
  }
  if (name === 'Formats') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#06b6d4" strokeWidth="1.8" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    )
  }
  if (name === 'License') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#06b6d4" strokeWidth="1.8" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    )
  }
  if (name === 'Rigged') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#06b6d4" strokeWidth="1.8" aria-hidden="true">
        <path d="M18 11V6a2 2 0 0 0-4 0v4M14 10V4a2 2 0 0 0-4 0v7M10 10.5V6a2 2 0 0 0-4 0v8M6 14a6 6 0 0 0 12 0v-3" />
      </svg>
    )
  }
  if (name === 'Textures') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#06b6d4" strokeWidth="1.8" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    )
  }
  if (name === 'Material Slots') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#06b6d4" strokeWidth="1.8" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="14" x2="21" y2="14" />
      </svg>
    )
  }
  if (name === 'UVs') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#06b6d4" strokeWidth="1.8" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#06b6d4" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

export function ProductSpecs({ product }: ProductSpecsProps) {
  const isDemoPreview = product.slug.startsWith('demo-')
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Category', value: product.category.name },
    { label: 'Triangles', value: formatCount(product.polygon_count ?? (isDemoPreview ? 100928 : null)) },
    { label: 'Vertices', value: formatCount(product.vertex_count ?? (isDemoPreview ? 70252 : null)) },
    { label: 'Viewer', value: product.preview_model ? 'Browser 3D' : 'Image preview' },
    { label: 'Rigged', value: yesNo(product.rigged) },
    { label: 'Animated', value: yesNo(product.animated) },
    { label: 'PBR materials', value: isDemoPreview ? 'Yes (demo)' : yesNo(product.pbr_ready) },
    { label: 'Game ready', value: yesNo(product.game_ready) },
    { label: 'Type', value: product.preview_model ? 'Interactive demo' : '3D asset' },
    { label: 'Geometry', value: isDemoPreview ? 'Illustrative' : 'Mesh' },
  ]

  return (
    <section className="product-detail-specs" aria-labelledby="product-specs-heading">
      <h2 id="product-specs-heading" className="product-detail-specs__heading">
        <span className="product-detail-specs__heading-icon" aria-hidden="true" hidden>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#06b6d4" strokeWidth="2">
            <path d="M12 2l8.5 4.9v9.8L12 21.6l-8.5-4.9V6.9L12 2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </span>
        Preview specifications
      </h2>
      <dl className="product-detail-specs__table">
        {rows.map((row) => (
          <div key={row.label} className="product-detail-specs__row">
            <dt>
              <span className="product-detail-specs__icon" aria-hidden="true" hidden>
                <SpecIcon name={row.label} />
              </span>
              {row.label}
            </dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="product-detail-specs__note">
        These values describe the interactive demo preview.
      </p>
    </section>
  )
}
