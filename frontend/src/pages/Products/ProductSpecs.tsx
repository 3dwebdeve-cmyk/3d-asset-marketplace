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

const SPEC_ICONS: Record<string, string> = {
  Category: '📁',
  Polygons: '⬡',
  Vertices: '◈',
  Software: '💻',
  Rigged: '🦴',
  Animated: '▶',
  'PBR materials': '🎨',
  'Game ready': '🎮',
  Formats: '📦',
  License: '©',
}

export function ProductSpecs({ product }: ProductSpecsProps) {
  const formats = Array.from(
    new Set(
      product.files
        .map((file) => file.file_format.trim().toUpperCase())
        .filter((format) => Boolean(format)),
    ),
  )

  const licenseLabel =
    product.license_type === 'extended'
      ? 'Extended'
      : product.license_type === 'editorial'
        ? 'Editorial'
        : 'Standard'

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Category', value: product.category.name },
    { label: 'Polygons', value: formatCount(product.polygon_count) },
    { label: 'Vertices', value: formatCount(product.vertex_count) },
    { label: 'Software', value: product.software_used.trim() || '—' },
    { label: 'Rigged', value: yesNo(product.rigged) },
    { label: 'Animated', value: yesNo(product.animated) },
    { label: 'PBR materials', value: yesNo(product.pbr_ready) },
    { label: 'Game ready', value: yesNo(product.game_ready) },
    { label: 'Formats', value: formats.length > 0 ? formats.join(', ') : '—' },
    { label: 'License', value: licenseLabel },
  ]

  return (
    <section className="product-detail-specs" aria-labelledby="product-specs-heading">
      <h2 id="product-specs-heading" className="product-detail-specs__heading">
        <span className="product-detail-specs__heading-icon" aria-hidden="true">
          ⬡
        </span>
        Technical Specs
      </h2>
      <dl className="product-detail-specs__table">
        {rows.map((row) => (
          <div key={row.label} className="product-detail-specs__row">
            <dt>
              <span className="product-detail-specs__icon" aria-hidden="true">
                {SPEC_ICONS[row.label] ?? '•'}
              </span>
              {row.label}
            </dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
