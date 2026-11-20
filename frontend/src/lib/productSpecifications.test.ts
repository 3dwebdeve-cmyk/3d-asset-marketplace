import { describe, expect, it } from 'vitest'
import type { PublicProductDetail } from '../types/product'
import { productSpecifications } from './productSpecifications'

const product = {
  category: { name: 'Furniture' }, software_used: 'Blender 4.2', license_type: 'standard',
  polygon_count: 12000, vertex_count: null,
  pbr_ready: true, game_ready: true, preview_model: '',
  formats: ['blend', 'fbx', 'zip'],
  files: [{ file_format: 'zip', file_size: 2048, is_preview: false }],
} as unknown as PublicProductDetail

describe('verified model specifications', () => {
  it('uses package contents for model formats and keeps the verified geometry rows', () => {
    const rows = productSpecifications(product)
    expect(rows).toContainEqual({ label: 'Formats', value: 'BLEND, FBX' })
    expect(rows).toContainEqual({ label: 'Polygons', value: '12,000' })
    expect(rows).toContainEqual({ label: 'PBR materials', value: 'Yes' })
    expect(rows).not.toContainEqual(expect.objectContaining({ label: 'Vertices' }))
  })

  it('does not show download size or game ready rows', () => {
    const rows = productSpecifications(product)
    expect(rows).not.toContainEqual(expect.objectContaining({ label: 'Download size' }))
    expect(rows).not.toContainEqual(expect.objectContaining({ label: 'Game ready' }))
  })

  it('does not claim formats from archive extensions or preview-only files', () => {
    const rows = productSpecifications({ ...product, formats: undefined, files: [
      ...product.files, { id: 'preview', file_name: 'preview.glb', file_format: 'glb', file_size: 100, version: '1', is_preview: true },
    ] })
    expect(rows).not.toContainEqual(expect.objectContaining({ label: 'Formats' }))
    expect(rows).toContainEqual({ label: 'Viewer', value: 'Image preview' })
  })
})
