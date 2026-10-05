const DEMO_PREVIEW_SLUGS = new Set([
  'demo-oak-chair',
  'demo-desk-lamp',
  'demo-plant-pot',
])

/** Existing seeded catalogs may still reference the old triangle or invalid R2 placeholder. */
export function resolveDemoPreviewUrl(slug: string, previewUrl: string): string {
  if (!DEMO_PREVIEW_SLUGS.has(slug)) return previewUrl

  try {
    const path = new URL(previewUrl).pathname
    const isOldFixture = path.endsWith('/fixtures/e2e-preview.glb')
    const isDemoUpload = path.endsWith(`/products/previews/demo/${slug}.glb`)
    if (!isOldFixture && !isDemoUpload) return previewUrl

    return new URL(`/fixtures/${slug}.glb`, window.location.origin).toString()
  } catch {
    return previewUrl
  }
}
