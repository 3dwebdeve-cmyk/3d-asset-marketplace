import type { PublicProductDetail } from '../types/product'
import { formatFileSize } from './format'

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
  const packageSize = downloadable.reduce((total, file) => total + (Number.isFinite(file.file_size) && file.file_size > 0 ? file.file_size : 0), 0)
  if (packageSize) rows.push({ label: 'Download size', value: formatFileSize(packageSize) })
  for (const [label, count] of [['Polygons', product.polygon_count], ['Vertices', product.vertex_count]] as const) {
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
      rows.push({ label, value: count.toLocaleString('en-US') })
    }
  }
  for (const [label, value] of [
    ['Rigged', product.rigged], ['Animated', product.animated],
    ['PBR materials', product.pbr_ready], ['Game ready', product.game_ready],
  ] as const) {
    if (typeof value === 'boolean') rows.push({ label, value: value ? 'Yes' : 'No' })
  }
  if (product.license_type) {
    rows.push({ label: 'License', value: product.license_type.charAt(0).toUpperCase() + product.license_type.slice(1) })
  }
  rows.push({ label: 'Viewer', value: product.preview_model ? 'Browser 3D' : 'Image preview' })
  return rows
}
