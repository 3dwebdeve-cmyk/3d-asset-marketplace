import type { PublicPluginDetail } from '../../types/plugin'

interface PluginSpecsProps {
  plugin: PublicPluginDetail
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) {
    return '—'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
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

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Category', value: plugin.category.name },
    { label: 'Version', value: plugin.version.trim() || '—' },
    { label: 'Compatible software', value: plugin.compatibility.trim() || '—' },
    { label: 'File format(s)', value: formats.length > 0 ? formats.join(', ') : '—' },
    {
      label: 'File size',
      value: primaryFile ? formatFileSize(primaryFile.file_size) : '—',
    },
    { label: 'Last updated', value: formatDate(plugin.updated_at) },
  ]

  return (
    <section className="product-detail-specs" aria-labelledby="plugin-specs-heading">
      <h2 id="plugin-specs-heading" className="visually-hidden">
        Plugin specifications
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
