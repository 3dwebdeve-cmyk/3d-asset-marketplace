/** Client-side mirrors of backend custom_projects.upload_rules. */

export const PROJECT_FILE_ACCEPT =
  '.jpg,.jpeg,.png,.webp,.pdf,.zip,image/jpeg,image/png,image/webp,application/pdf,application/zip,application/x-zip-compressed'

export const PROJECT_FILE_FORMAT_LABELS = [
  'JPG',
  'PNG',
  'WebP',
  'PDF',
  'ZIP',
] as const

export const PROJECT_FILE_MAX_MB = 20
export const PROJECT_FILE_MAX_BYTES = PROJECT_FILE_MAX_MB * 1024 * 1024

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.zip',
])

export function getProjectFileExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  if (index < 0) return ''
  return fileName.slice(index).toLowerCase()
}

export function validateProjectFile(file: File): string | null {
  const extension = getProjectFileExtension(file.name)
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return `Invalid file type. Allowed: ${PROJECT_FILE_FORMAT_LABELS.join(', ')}.`
  }
  if (file.size <= 0) {
    return 'File is empty.'
  }
  if (file.size > PROJECT_FILE_MAX_BYTES) {
    return `File must be ${PROJECT_FILE_MAX_MB} MB or smaller.`
  }
  return null
}
