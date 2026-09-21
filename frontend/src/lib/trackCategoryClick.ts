import { recordCategoryClick } from '../api/categoriesApi'

const DEDUPE_WINDOW_MS = 2000
const recentClicks = new Map<string, number>()

/**
 * Fire-and-forget category interest tracking.
 * Dedupes the same category within 2s so Explore/Trending + Models browse
 * do not double-count a single navigation.
 */
export function trackCategoryClick(categoryId: string): void {
  const id = categoryId.trim()
  if (!id) return

  const now = Date.now()
  const last = recentClicks.get(id) ?? 0
  if (now - last < DEDUPE_WINDOW_MS) return
  recentClicks.set(id, now)

  void recordCategoryClick(id).catch(() => {
    // Never block navigation or surface tracking failures to the user.
  })
}
