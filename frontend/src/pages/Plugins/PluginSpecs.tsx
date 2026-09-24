import type { PublicPluginDetail } from '../../types/plugin'
import { formatDate, formatFileSize } from '../../lib/format'

interface PluginSpecsProps {
  plugin: PublicPluginDetail
}

const SPEC_ICONS: Record<string, string> = {
  Category: '📁',
  Version: '🏷️',
  Compatibility: '💻',
  Formats: '📦',
  'File size': '🗂',
  'Last updated': '📅',
  License: '©',
}

export function PluginSpecs({ plugin }: PluginSpecsProps) {
  const formats = Array.from(
    new Set(
      plugin.files
        .map((file) => file.file_format.trim().toUpperCase())
        .filter((format) => Boolean(format)),
    ),
  )

  const primaryFile =
    plugin.files.find((file) => file.is_primary) ?? plugin.files[0] ?? null

  const licenseLabel =
    plugin.license_type === 'extended'
      ? 'Extended'
      : plugin.license_type === 'commercial'
        ? 'Commercial'
        : 'Standard'

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Category', value: plugin.category.name },
    { label: 'Version', value: plugin.version.trim() || '—' },
    { label: 'Compatibility', value: plugin.compatibility.trim() || '—' },
    { label: 'Formats', value: formats.length > 0 ? formats.join(', ') : '—' },
    {
      label: 'File size',
      value: primaryFile ? formatFileSize(primaryFile.file_size) : '—',
    },
    { label: 'Last updated', value: formatDate(plugin.updated_at) },
    { label: 'License', value: licenseLabel },
  ]

  return (
    <section className="product-detail-specs" aria-labelledby="plugin-specs-heading">
      <h2 id="plugin-specs-heading" className="product-detail-specs__heading">
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
