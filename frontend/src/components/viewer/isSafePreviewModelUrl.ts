/**
 * Accepts only absolute http(s) URLs whose path looks like a GLB/glTF preview.
 * Rejects blank values, relative paths, and non-model extensions.
 */
export function isSafePreviewModelUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) {
    return false
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }

    const pathname = parsed.pathname.toLowerCase()
    return pathname.endsWith('.glb') || pathname.endsWith('.gltf')
  } catch {
    return false
  }
}
