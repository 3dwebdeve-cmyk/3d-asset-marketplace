import type { PublicProductDetail } from '../types/product'

/** Use the same verified facts in the browser and the first HTML response. */
export function productSpecifications(product: PublicProductDetail): { label: string; value: string }[] {
  const files = product.files ?? []
  const downloadable = files.filter((file) => !file.is_preview)
  const formats = [...new Set((product.formats ?? downloadable.map((file) => file.file_format))
    .map((format) => format?.trim().replace(/^\./, '').toUpperCase())
    .filter((format) => Boolean(format) && !['ZIP', 'RAR', '7Z'].includes(format)))]
  const rows = [{ label: 'Category', value: product.category.name }]
  if (product.software_used?.trim()) rows.push({ label: 'Software', value: product.software_used })
  if (formats.length) rows.push({ label: 'Formats', value: formats.join(', ') })
  for (const [label, count] of [['Polygons', product.polygon_count], ['Vertices', product.vertex_count]] as const) {
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
      rows.push({ label, value: count.toLocaleString('en-US') })
    }
  }
  if (typeof product.pbr_ready === 'boolean') rows.push({ label: 'PBR materials', value: product.pbr_ready ? 'Yes' : 'No' })
  if (product.license_type) {
    rows.push({ label: 'License', value: product.license_type.charAt(0).toUpperCase() + product.license_type.slice(1) })
  }
  rows.push({ label: 'Viewer', value: product.preview_model ? 'Browser 3D' : 'Image preview' })
  return rows
}
