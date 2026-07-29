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

export function ProductSpecs({ product }: ProductSpecsProps) {
  const formats = Array.from(
    new Set(
      product.files
        .map((file) => file.file_format.trim().toUpperCase())
        .filter((format) => Boolean(format)),
    ),
  )

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Category', value: product.category.name },
    { label: 'Polygon count', value: formatCount(product.polygon_count) },
    { label: 'Vertex count', value: formatCount(product.vertex_count) },
    { label: 'Software', value: product.software_used.trim() || '—' },
    { label: 'Rigged', value: yesNo(product.rigged) },
    { label: 'Animated', value: yesNo(product.animated) },
    { label: 'PBR materials', value: yesNo(product.pbr_ready) },
    { label: 'Game ready', value: yesNo(product.game_ready) },
    { label: 'Included formats', value: formats.length > 0 ? formats.join(', ') : '—' },
  ]

  return (
    <section className="product-detail-specs" aria-labelledby="product-specs-heading">
      <h2 id="product-specs-heading" className="visually-hidden">
        Technical specifications
      </h2>
      <dl className="product-detail-specs__table">
        {rows.map((row) => (
          <div key={row.label} className="product-detail-specs__row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
