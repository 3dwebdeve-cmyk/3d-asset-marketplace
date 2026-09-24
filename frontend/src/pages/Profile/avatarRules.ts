export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

export const AVATAR_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const

export const AVATAR_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export function getFileExtension(filename: string): string {
  const index = filename.lastIndexOf('.')
  if (index < 0) {
    return ''
  }
  return filename.slice(index).toLowerCase()
}

export function validateAvatarFile(file: File): string | null {
  const extension = getFileExtension(file.name)
  if (!AVATAR_ALLOWED_EXTENSIONS.includes(extension as (typeof AVATAR_ALLOWED_EXTENSIONS)[number])) {
    return `Invalid file extension. Allowed: ${AVATAR_ALLOWED_EXTENSIONS.join(', ')}.`
  }

  if (
    !AVATAR_ALLOWED_MIME_TYPES.includes(
      file.type as (typeof AVATAR_ALLOWED_MIME_TYPES)[number],
    )
  ) {
    return `Invalid MIME type. Allowed: ${AVATAR_ALLOWED_MIME_TYPES.join(', ')}.`
  }

  if (file.size <= 0) {
    return 'Avatar file is empty.'
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return 'Avatar must be 2 MB or smaller.'
  }

  return null
}
