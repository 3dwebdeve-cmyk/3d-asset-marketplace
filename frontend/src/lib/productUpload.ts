export const PRODUCT_IMAGE_ACCEPT =
  '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

export const PRODUCT_IMAGE_FORMAT_LABELS = ['JPG', 'PNG', 'WebP'] as const

export const PRODUCT_FILE_ACCEPT =
  '.glb,.gltf,.blend,.fbx,.obj,.usdz,.zip,.rar,.7z'

export const PRODUCT_FILE_FORMAT_LABELS = [
  'GLB',
  'GLTF',
  'Blend',
  'FBX',
  'OBJ',
  'USDZ',
  'ZIP',
  'RAR',
  '7Z',
] as const

export const PRODUCT_IMAGE_MAX_MB = 5
export const PRODUCT_FILE_MAX_MB = 50

export const PREVIEW_MODEL_FORMATS = new Set(['glb', 'gltf'])

export function isPreviewModelFile(file: File): boolean {
  const name = file.name.trim().toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot < 0) {
    return false
  }
  return PREVIEW_MODEL_FORMATS.has(name.slice(dot + 1))
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatFormatLabel(format: string): string {
  return format.trim().toUpperCase()
}
