export const MODEL_PAGE_SIZE = 12

export function readCatalogPage(params: URLSearchParams): number {
  const value = params.get('page') ?? '1'
  const page = Number(value)
  return /^\d+$/.test(value) && Number.isSafeInteger(page) && page > 0 ? page : 1
}

/** Page one has a clean address; every later page identifies its own models. */
export function catalogPagePath(path: string, page: number, params = new URLSearchParams()): string {
  const next = new URLSearchParams(params)
  next.delete('page')
  if (page > 1) next.set('page', String(page))
  const query = next.toString()
  return `${path}${query ? `?${query}` : ''}`
}

/** Collection pages are indexable; ad-hoc searches, filters and sorts are not. */
export function hasCatalogFilters(params: URLSearchParams): boolean {
  return ['search', 'category', 'formats', 'licenses', 'min_price', 'max_price',
    'animated', 'rigged', 'pbr_ready', 'game_ready'].some((key) => Boolean(params.get(key)?.trim())) ||
    Boolean(params.get('ordering')?.trim() && params.get('ordering') !== '-created_at')
}
